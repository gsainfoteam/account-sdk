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
import 'scopes.generated.dart';

/// [url] 을 브라우저 세션으로 열고 callback URL 로 완료된다. 테스트에서 바꿔 끼울 수 있다.
typedef BrowserAuthenticator = Future<String> Function(Uri url, String callbackUrlScheme);

/// 시스템 브라우저로 사용자를 로그인시키고 서비스 백엔드의 세션을 유지한다.
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

  /// 세션을 refresh 하는 동안 쓰기 잠금을 잡는다. 그래서 요청들은 새 토큰을 기다린다.
  final ReadWriteMutex mutex = ReadWriteMutex();
  final _state = BehaviorSubject.seeded(const AccountState(AccountStatus.loading));

  /// 현재 상태를 먼저 내보내고, 그 뒤로 바뀔 때마다 내보낸다.
  Stream<AccountState> get states => _state.stream;
  AccountState get state => _state.value;
  String? get accessToken => _state.value.accessToken;

  /// 저장한 세션을 불러온다. 네트워크 요청은 하지 않는다.
  Future<void> restore() async {
    final stored = await _store.read();

    if (stored == null) {
      _state.add(const AccountState(AccountStatus.unauthenticated));
    } else {
      _state.add(AccountState(AccountStatus.authenticated, stored.accessToken));
    }
  }

  /// IdP 로그인 페이지를 열고, callback 을 검증하고, code 를 교환하고, 서비스에 로그인한다.
  ///
  /// PKCE, `state` 확인, code 교환은 `package:oauth2` 가 한다. callback 에 `iss` 가 있으면 IdP 의 호스트 중
  /// 하나여야 한다.
  ///
  /// 로그아웃해도 IdP 자체의 로그인 세션은 끝나지 않는다. 그래서 [logout] 뒤 첫 로그인에는 `prompt=login` 을
  /// 붙여 사용자가 계정을 바꿀 수 있게 한다. [AccountScope.offlineAccess] 가 있으면 `prompt=consent` 를
  /// 붙인다. account-fe 가 이 scope 에 요구한다.
  ///
  /// 실패하면 [AccountException] 을 던진다. 사용자가 그만두면 [AccountCancelledException] 이다.
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

  /// 저장한 세션을 지우고 서비스 백엔드에 알린다.
  /// 어차피 기기에서는 로그아웃되므로 서버 쪽 실패는 무시한다.
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

  /// 서비스 백엔드에서 새 access token 을 받고, 세션이 있는지 돌려준다.
  ///
  /// 동시에 401 을 받은 요청들은 refresh 하나를 같이 쓴다. [staleToken] 을 다른 호출이 이미 교체했다면
  /// 다시 refresh 하지 않고 그 새 토큰을 유지한다.
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
