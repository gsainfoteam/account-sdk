import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:http/http.dart' as http;
import 'package:mutex/mutex.dart';
import 'package:oauth2/oauth2.dart' as oauth2;
import 'package:rxdart/rxdart.dart';

import '../constants.dart';
import '../discovery/account_issuer.dart';
import '../discovery/account_metadata.dart';
import '../discovery/discover.dart';
import '../errors/account_exception.dart';
import '../session/session_adapter.dart';
import '../storage/secure_token_store.dart';
import '../storage/token_store.dart';
import 'account_prompt.dart';
import 'account_state.dart';
import 'scopes.dart';

/// Opens [url] in a browser session and completes with the callback URL. Replaceable in tests.
typedef BrowserAuthenticator = Future<String> Function(Uri url, String callbackUrlScheme);

/// Signs a user in through the system browser and keeps the service backend's session.
///
/// ```dart
/// final account = AccountClient(
///   issuer: AccountIssuer.production,
///   clientId: 'pot-g',
///   redirectUri: Uri.parse('pot-g://callback'),
///   scopes: [AccountScope.name, AccountScope.email],
///   session: BodySession(dio: dio, paths: const SessionPaths(login: '/api/v1/user/login')),
/// );
/// await account.restore();
/// dio.interceptors.add(AccountInterceptor(account, dio));
/// ```
class AccountClient {
  AccountClient({
    required this.issuer,
    required this.clientId,
    required this.redirectUri,
    required this.scopes,
    required this.session,
    TokenStore? store,
    http.Client? httpClient,
    BrowserAuthenticator? authenticate,
  }) : _store = store ?? SecureTokenStore(),
       _http = httpClient ?? http.Client(),
       _browser = authenticate ?? _systemBrowser;

  final AccountIssuer issuer;
  final String clientId;
  final Uri redirectUri;
  final List<AccountScope> scopes;
  final SessionAdapter session;

  final TokenStore _store;
  final http.Client _http;
  final BrowserAuthenticator _browser;

  /// Held for writing while the session refreshes, so requests wait for the new token.
  final ReadWriteMutex mutex = ReadWriteMutex();
  final _state = BehaviorSubject.seeded(const AccountState(AccountStatus.loading));

  /// Emits the current state first, then every change.
  Stream<AccountState> get states => _state.stream;
  AccountState get state => _state.value;
  String? get accessToken => _state.value.accessToken;

  /// Loads the stored session. Makes no network request.
  Future<void> restore() async {
    final stored = await _store.read();

    if (stored == null) {
      _state.add(const AccountState(AccountStatus.unauthenticated));
    } else {
      _state.add(AccountState(AccountStatus.authenticated, stored.accessToken));
    }
  }

  /// Opens the IdP login page, validates the callback, exchanges the code and logs in to the service.
  ///
  /// PKCE, `state` checking and the code exchange are done by `package:oauth2`. An `iss` in the callback
  /// must be one of the IdP's hosts.
  ///
  /// Signing out does not end the IdP's own login session, so the first sign-in after [logout] asks for
  /// `prompt=login` and the user can switch accounts. With [AccountScope.offlineAccess] it asks for
  /// `prompt=consent`, which account-fe requires for that scope.
  ///
  /// Throws an [AccountException], such as [AccountCancelledException] when the user backs out.
  Future<void> login() async {
    final metadata = await discover(issuer, client: _http);
    _checkScopes(metadata);

    final grant = oauth2.AuthorizationCodeGrant(
      clientId,
      metadata.authorizationEndpoint,
      metadata.tokenEndpoint,
      httpClient: _http,
    );
    final url = await _authorizationUrl(grant);

    final parameters = await _openBrowser(url);
    _checkIssuer(metadata, parameters);

    final idp = await _exchange(grant, parameters);
    final tokens = await session.start(idp.credentials.accessToken);

    await _authenticate(tokens.accessToken, tokens.refreshToken);
    await _store.writeLoggedOut(false);
  }

  /// Clears the stored session and tells the service backend.
  /// A failure on the server side is ignored because the device is signed out either way.
  Future<void> logout() async {
    final stored = await _store.read();

    await _unauthenticate();
    await _store.writeLoggedOut(true);

    try {
      await session.end(accessToken: stored?.accessToken, refreshToken: stored?.refreshToken);
    } on AccountException {
      return;
    }
  }

  /// Gets a new access token from the service backend and returns whether there is a session.
  ///
  /// Requests that hit 401 at the same time share one refresh. When [staleToken] has already been
  /// replaced by another caller, the newer token is kept without refreshing again.
  Future<bool> refresh({String? staleToken}) async {
    if (mutex.isWriteLocked) {
      await mutex.acquireRead();
      mutex.release();

      return accessToken != null;
    }

    await mutex.acquireWrite();
    try {
      final current = accessToken;
      if (current != null && staleToken != null && current != staleToken) return true;

      final refreshToken = (await _store.read())?.refreshToken;
      final tokens = refreshToken == null ? null : await session.refresh(refreshToken);

      if (tokens == null) {
        await _unauthenticate();
        return false;
      }

      await _authenticate(tokens.accessToken, tokens.refreshToken ?? refreshToken);
      return true;
    } finally {
      mutex.release();
    }
  }

  Future<void> dispose() => _state.close();

  Future<void> _authenticate(String accessToken, String? refreshToken) async {
    await _store.write(StoredSession(accessToken: accessToken, refreshToken: refreshToken));
    _state.add(AccountState(AccountStatus.authenticated, accessToken));
  }

  Future<void> _unauthenticate() async {
    await _store.clear();
    _state.add(const AccountState(AccountStatus.unauthenticated));
  }

  void _checkScopes(AccountMetadata metadata) {
    if (metadata.scopesSupported.isEmpty) return;

    final unsupported = scopes.where((scope) => !metadata.scopesSupported.contains(scope.value));
    if (unsupported.isEmpty) return;

    throw AccountOAuthException(
      OAuthErrorCode.invalidScope.wire,
      unsupported.map((scope) => scope.value).join(' '),
    );
  }

  Future<Uri> _authorizationUrl(oauth2.AuthorizationCodeGrant grant) async {
    final url = grant.getAuthorizationUrl(
      redirectUri,
      scopes: scopes.map((scope) => scope.value),
      state: _randomState(),
    );

    final prompt = await _prompt();
    if (prompt == null) return url;

    return url.replace(queryParameters: {...url.queryParameters, 'prompt': prompt.name});
  }

  Future<AccountPrompt?> _prompt() async {
    if (await _store.readLoggedOut()) return AccountPrompt.login;
    if (scopes.contains(AccountScope.offlineAccess)) return AccountPrompt.consent;

    return null;
  }

  Future<Map<String, String>> _openBrowser(Uri url) async {
    try {
      final callback = await _browser(url, redirectUri.scheme);
      return Uri.parse(callback).queryParameters;
    } on PlatformException catch (error) {
      if (error.code == _browserCancelledCode) throw const AccountCancelledException();
      rethrow;
    }
  }

  void _checkIssuer(AccountMetadata metadata, Map<String, String> parameters) {
    final iss = parameters['iss'];
    if (iss == null || metadata.issuers.contains(iss)) return;

    throw AccountIssuerMismatchException(iss);
  }

  Future<oauth2.Client> _exchange(
    oauth2.AuthorizationCodeGrant grant,
    Map<String, String> parameters,
  ) async {
    try {
      return await grant.handleAuthorizationResponse(parameters);
    } on FormatException catch (error) {
      if (error.message.contains('"state"')) throw const AccountStateMismatchException();
      throw AccountOAuthException(_invalidResponseError, error.message);
    } on oauth2.AuthorizationException catch (error) {
      throw _fromAuthorizationError(error);
    }
  }
}

const _browserCancelledCode = 'CANCELED';
const _invalidResponseError = 'invalid_response';

Future<String> _systemBrowser(Uri url, String callbackUrlScheme) =>
    FlutterWebAuth2.authenticate(url: url.toString(), callbackUrlScheme: callbackUrlScheme);

String _randomState() {
  final random = Random.secure();
  final bytes = List<int>.generate(AccountConstants.stateByteLength, (_) => random.nextInt(256));

  return base64UrlEncode(bytes).replaceAll('=', '');
}

AccountException _fromAuthorizationError(oauth2.AuthorizationException error) {
  if (OAuthErrorCode.parse(error.error) != OAuthErrorCode.accessDenied) {
    return AccountOAuthException(error.error, error.description);
  }

  return switch (AccountDenialReason.parse(error.description)) {
    AccountDenialReason.userCancelled => const AccountCancelledException(),
    final reason => AccountDeniedException(reason, error.description),
  };
}
