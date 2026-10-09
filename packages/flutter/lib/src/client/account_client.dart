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
///   session: BodySession(dio: dio, loginPath: '/api/v1/user/login'),
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
       _authenticate = authenticate ?? _systemBrowser;

  final AccountIssuer issuer;
  final String clientId;
  final Uri redirectUri;
  final List<AccountScope> scopes;
  final SessionAdapter session;
  final TokenStore _store;
  final http.Client _http;
  final BrowserAuthenticator _authenticate;

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
    _state.add(
      stored == null
          ? const AccountState(AccountStatus.unauthenticated)
          : AccountState(AccountStatus.authenticated, stored.accessToken),
    );
  }

  /// Opens the IdP login page, validates the callback, exchanges the code and logs in to the service.
  ///
  /// PKCE, `state` checking and the code exchange are done by `package:oauth2`. An `iss` in the callback
  /// must be one of the IdP's hosts.
  ///
  /// Signing out does not end the IdP's own login session, so the first sign-in after [signOut] asks for
  /// `prompt=login` and the user can switch accounts. With [AccountScope.offlineAccess] it asks for
  /// `prompt=consent`, which account-fe requires for that scope.
  ///
  /// Throws an [AccountException], such as [AccountCancelledException] when the user backs out.
  Future<void> signIn() async {
    final metadata = await discover(issuer, client: _http);
    final grant = oauth2.AuthorizationCodeGrant(
      clientId,
      metadata.authorizationEndpoint,
      metadata.tokenEndpoint,
      httpClient: _http,
    );
    final unsupported = metadata.scopesSupported.isEmpty
        ? const <AccountScope>[]
        : scopes.where((scope) => !metadata.scopesSupported.contains(scope.value)).toList();
    if (unsupported.isNotEmpty) {
      throw AccountOAuthException(
        OAuthErrorCode.invalidScope.wire,
        unsupported.map((scope) => scope.value).join(' '),
      );
    }
    final state = _randomState();
    var url = grant.getAuthorizationUrl(
      redirectUri,
      scopes: scopes.map((scope) => scope.value),
      state: state,
    );
    final prompt = await _prompt();
    if (prompt != null) {
      url = url.replace(queryParameters: {...url.queryParameters, 'prompt': prompt.name});
    }

    final String result;
    try {
      result = await _authenticate(url, redirectUri.scheme);
    } on PlatformException catch (error) {
      if (error.code == 'CANCELED') throw const AccountCancelledException();
      rethrow;
    }

    final parameters = Uri.parse(result).queryParameters;
    final iss = parameters['iss'];
    if (iss != null && !metadata.issuers.contains(iss)) {
      throw AccountIssuerMismatchException(iss);
    }

    final oauth2.Client idp;
    try {
      idp = await grant.handleAuthorizationResponse(parameters);
    } on FormatException catch (error) {
      if (error.message.contains('"state"')) {
        throw const AccountStateMismatchException();
      }
      throw AccountOAuthException('invalid_response', error.message);
    } on oauth2.AuthorizationException catch (error) {
      throw _fromAuthorizationError(error);
    }

    final tokens = await session.login(idp.credentials.accessToken);
    await _store.write(
      StoredSession(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken),
    );
    await _store.writeSignedOut(false);
    _state.add(AccountState(AccountStatus.authenticated, tokens.accessToken));
  }

  /// Clears the stored session and tells the service backend.
  /// A failure on the server side is ignored because the device is signed out either way.
  Future<void> signOut() async {
    final stored = await _store.read();
    await _store.clear();
    await _store.writeSignedOut(true);
    _state.add(const AccountState(AccountStatus.unauthenticated));
    try {
      await session.logout(accessToken: stored?.accessToken, refreshToken: stored?.refreshToken);
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
      if (current != null && staleToken != null && current != staleToken) {
        return true;
      }
      final stored = await _store.read();
      final refreshToken = stored?.refreshToken;
      final tokens = refreshToken == null ? null : await session.refresh(refreshToken);
      if (tokens == null) {
        await _store.clear();
        _state.add(const AccountState(AccountStatus.unauthenticated));
        return false;
      }
      await _store.write(
        StoredSession(
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? refreshToken,
        ),
      );
      _state.add(AccountState(AccountStatus.authenticated, tokens.accessToken));
      return true;
    } finally {
      mutex.release();
    }
  }

  Future<void> dispose() => _state.close();

  Future<AccountPrompt?> _prompt() async {
    if (await _store.readSignedOut()) return AccountPrompt.login;
    if (scopes.contains(AccountScope.offlineAccess)) return AccountPrompt.consent;
    return null;
  }
}

Future<String> _systemBrowser(Uri url, String callbackUrlScheme) =>
    FlutterWebAuth2.authenticate(url: url.toString(), callbackUrlScheme: callbackUrlScheme);

String _randomState() {
  final random = Random.secure();
  return base64UrlEncode(
    List<int>.generate(AccountConstants.stateByteLength, (_) => random.nextInt(256)),
  ).replaceAll('=', '');
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
