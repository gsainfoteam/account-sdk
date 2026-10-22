import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:http/http.dart' as http;
import 'package:mutex/mutex.dart';
import 'package:rxdart/rxdart.dart';

import '../constants.dart';
import '../discovery/account_issuer.dart';
import '../discovery/account_metadata.dart';
import '../discovery/discover.dart';
import '../errors/account_exception.dart';
import '../session/api_session.dart';
import '../session/session_paths.dart';
import '../storage/secure_token_store.dart';
import '../storage/token_store.dart';
import 'account_prompt.dart';
import 'account_state.dart';
import 'scopes.generated.dart';

/// [url] 을 브라우저 세션으로 열고 callback URL 로 완료된다. 테스트에서 바꿔 끼울 수 있다.
typedef BrowserAuthenticator = Future<String> Function(Uri url, String callbackUrlScheme);

/// 시스템 브라우저로 사용자를 로그인시키고 서비스 백엔드의 세션을 유지한다.
///
/// 로그인 흐름은 웹과 같다. callback 의 code 를 서비스 백엔드(`@gsainfoteam/account-nest` 세션 모듈)에 넘기면
/// 백엔드가 confidential client 로 교환하고 id_token 으로 사용자를 확인한다.
///
/// ```dart
/// final account = AccountClient(
///   issuer: AccountIssuer.production,
///   clientId: 'pot-g',
///   redirectUri: Uri.parse('pot-g://callback'),
///   api: Uri.parse('https://api.pot-g.gistory.me'),
///   loginBody: () async => {'device_id': await deviceId()},
/// );
/// await account.restore();
/// dio.interceptors.add(AccountInterceptor(account, dio));
/// ```
class AccountClient {
  AccountClient({
    required this.issuer,
    required this.clientId,
    required this.redirectUri,
    required this.api,
    this.scopes,
    this.paths = const SessionPaths(),
    this.loginBody,
    TokenStore? store,
    http.Client? httpClient,
    BrowserAuthenticator? authenticate,
  }) : _store = store ?? SecureTokenStore(),
       _http = httpClient ?? http.Client(),
       _browser = authenticate ?? _systemBrowser;

  final AccountIssuer issuer;
  final String clientId;
  final Uri redirectUri;

  /// 서비스 백엔드의 origin 이나 기본 경로. [paths] 의 세션 endpoint 를 여기서 부른다.
  final Uri api;
  final SessionPaths paths;

  /// 요청할 scope. `null` 이면 IdP 에 등록한 필수와 선택 scope 전부다. `openid` 는 항상 함께 요청한다.
  final List<AccountScope>? scopes;

  /// 로그인 요청에 더할 필드. pot-g-be 의 `device_id` 같은 것이다.
  final Future<Map<String, Object?>> Function()? loginBody;

  final TokenStore _store;
  final http.Client _http;
  final BrowserAuthenticator _browser;
  late final _session = ApiSession(_http, api, paths);
  String? _ticket;

  /// 세션을 refresh 하는 동안 쓰기 잠금을 잡는다. 그래서 요청들은 새 토큰을 기다린다.
  final ReadWriteMutex mutex = ReadWriteMutex();
  final _state = BehaviorSubject.seeded(const AccountState(AccountStatus.loading));

  /// 현재 상태를 먼저 내보내고, 그 뒤로 바뀔 때마다 내보낸다.
  Stream<AccountState> get states => _state.stream;
  AccountState get state => _state.value;
  String? get accessToken => _state.value.accessToken;

  /// 서비스 백엔드가 로그인을 거절했고, [retryLogin] 으로 이어 갈 수 있다.
  bool get canRetryLogin => _ticket != null;

  /// 저장한 세션을 불러온다. 네트워크 요청은 하지 않는다.
  Future<void> restore() async {
    final stored = await _store.read();

    if (stored == null) {
      _state.add(const AccountState(AccountStatus.unauthenticated));
    } else {
      _state.add(AccountState(AccountStatus.authenticated, stored.accessToken));
    }
  }

  /// IdP 로그인 페이지를 열고, callback 을 검증하고, 서비스 백엔드에 로그인한다.
  ///
  /// PKCE(`S256`), `state`, `nonce` 를 붙이고, callback 의 `state` 를 가장 먼저 확인한다. callback 에 `iss` 가
  /// 있으면 IdP 의 호스트 중 하나여야 한다.
  ///
  /// 로그아웃해도 IdP 자체의 로그인 세션은 끝나지 않는다. 그래서 [logout] 뒤 첫 로그인에는 `prompt=login` 을
  /// 붙여 사용자가 계정을 바꿀 수 있게 한다. [AccountScope.offlineAccess] 가 있으면 `prompt=consent` 를
  /// 붙인다. account-fe 가 이 scope 에 요구한다.
  ///
  /// 실패하면 [AccountException] 을 던진다. 사용자가 그만두면 [AccountCancelledException],
  /// 서비스 백엔드가 거절하면 [AccountSessionRejectedException] 이다.
  Future<void> login() async {
    final metadata = await discover(issuer, client: _http);
    final requested = scopes ?? await _registeredScopes(metadata);
    _checkScopes(metadata, requested);

    final state = _random();
    final verifier = _random();
    final nonce = _random();
    final prompt = await _prompt(requested);

    final url = metadata.authorizationEndpoint.replace(
      queryParameters: {
        'response_type': 'code',
        'client_id': clientId,
        'redirect_uri': redirectUri.toString(),
        'scope': [_openidScope, ...requested.map((scope) => scope.value)].join(' '),
        'state': state,
        'nonce': nonce,
        'code_challenge': _challenge(verifier),
        'code_challenge_method': _codeChallengeMethod,
        if (prompt != null) 'prompt': prompt.name,
      },
    );

    final parameters = await _openBrowser(url);
    final code = _readCallback(metadata, parameters, state);

    await _start({
      ...?await loginBody?.call(),
      'code': code,
      'code_verifier': verifier,
      'redirect_uri': redirectUri.toString(),
      'nonce': nonce,
      'iss': ?parameters['iss'],
    });
  }

  /// 서비스 백엔드가 거절한 로그인을 [body] 를 더해 다시 보낸다. 예를 들어 약관 동의를 요구하며 거절했을 때
  /// 동의 내용을 보낸다. 거절 응답의 ticket 으로 보내므로 IdP 를 다시 거치지 않는다.
  ///
  /// 이어 갈 로그인이 없으면 [StateError] 를 던진다. [canRetryLogin] 으로 먼저 확인한다.
  Future<void> retryLogin(Map<String, Object?> body) async {
    final ticket = _ticket;
    if (ticket == null) throw StateError('no login to retry');

    await _start({...body, 'ticket': ticket});
  }

  /// 저장한 세션을 지우고 서비스 백엔드에 알린다.
  /// 어차피 기기에서는 로그아웃되므로 서버 쪽 실패는 무시한다.
  Future<void> logout() async {
    final stored = await _store.read();

    _ticket = null;
    await _unauthenticate();
    await _store.writeLoggedOut(true);

    try {
      await _session.end(accessToken: stored?.accessToken, refreshToken: stored?.refreshToken);
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
      final tokens = refreshToken == null ? null : await _session.refresh(refreshToken);

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

  Future<void> _start(Map<String, Object?> body) async {
    try {
      final tokens = await _session.start(body);

      _ticket = null;
      await _authenticate(tokens.accessToken, tokens.refreshToken);
      await _store.writeLoggedOut(false);
    } on SessionRejection catch (rejection) {
      _ticket = rejection.ticket;
      throw rejection.exception;
    }
  }

  Future<void> _authenticate(String accessToken, String? refreshToken) async {
    await _store.write(StoredSession(accessToken: accessToken, refreshToken: refreshToken));
    _state.add(AccountState(AccountStatus.authenticated, accessToken));
  }

  Future<void> _unauthenticate() async {
    await _store.clear();
    _state.add(const AccountState(AccountStatus.unauthenticated));
  }

  Future<List<AccountScope>> _registeredScopes(AccountMetadata metadata) async {
    final path = AccountConstants.clientRegistrationPath.replaceFirst(
      '{clientId}',
      Uri.encodeComponent(clientId),
    );

    final http.Response response;
    try {
      response = await _http.get(
        metadata.tokenEndpoint.replace(path: path),
        headers: {'accept': 'application/json'},
      );
    } on Exception catch (cause) {
      throw AccountNetworkException(cause);
    }

    final known = response.statusCode == 404 || response.statusCode == 400;
    if (response.statusCode != 200) {
      throw AccountOAuthException(
        known ? OAuthErrorCode.invalidClient.wire : OAuthErrorCode.serverError.wire,
        'GET $path -> ${response.statusCode}',
      );
    }

    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      throw AccountOAuthException(OAuthErrorCode.serverError.wire, '$path is not JSON');
    }

    if (json case {
      'scopes': final List<Object?> required,
      'optionalScopes': final List<Object?> optional,
    }) {
      return [
        for (final value in [...required, ...optional])
          ...AccountScope.values.where((scope) => scope.value == value),
      ];
    }
    throw AccountOAuthException(OAuthErrorCode.serverError.wire, '$path has no scopes');
  }

  void _checkScopes(AccountMetadata metadata, List<AccountScope> requested) {
    if (metadata.scopesSupported.isEmpty) return;

    final unsupported = requested.where((scope) => !metadata.scopesSupported.contains(scope.value));
    if (unsupported.isEmpty) return;

    throw AccountOAuthException(
      OAuthErrorCode.invalidScope.wire,
      unsupported.map((scope) => scope.value).join(' '),
    );
  }

  Future<AccountPrompt?> _prompt(List<AccountScope> requested) async {
    if (await _store.readLoggedOut()) return AccountPrompt.login;
    if (requested.contains(AccountScope.offlineAccess)) return AccountPrompt.consent;

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

  /// callback 을 검증하고 code 를 돌려준다. 위조된 redirect 는 에러를 전달하는 것조차 못 하게, `state` 를 먼저 본다.
  String _readCallback(AccountMetadata metadata, Map<String, String> parameters, String state) {
    if (parameters['state'] != state) throw const AccountStateMismatchException();

    final iss = parameters['iss'];
    if (iss != null && !metadata.issuers.contains(iss)) throw AccountIssuerMismatchException(iss);

    if (parameters['error'] case final String error) {
      throw _fromAuthorizationError(error, parameters['error_description']);
    }

    final code = parameters['code'];
    if (code == null || code.isEmpty) {
      throw AccountOAuthException(_invalidResponseError, 'missing code');
    }

    return code;
  }
}

const _openidScope = 'openid';
const _codeChallengeMethod = 'S256';
const _browserCancelledCode = 'CANCELED';
const _invalidResponseError = 'invalid_response';

Future<String> _systemBrowser(Uri url, String callbackUrlScheme) =>
    FlutterWebAuth2.authenticate(url: url.toString(), callbackUrlScheme: callbackUrlScheme);

String _base64Url(List<int> bytes) => base64UrlEncode(bytes).replaceAll('=', '');

String _random() {
  final random = Random.secure();

  return _base64Url(List.generate(AccountConstants.randomByteLength, (_) => random.nextInt(256)));
}

String _challenge(String verifier) => _base64Url(sha256.convert(ascii.encode(verifier)).bytes);

AccountException _fromAuthorizationError(String error, String? description) {
  if (OAuthErrorCode.parse(error) != OAuthErrorCode.accessDenied) {
    return AccountOAuthException(error, description);
  }

  return switch (AccountDenialReason.parse(description)) {
    AccountDenialReason.userCancelled => const AccountCancelledException(),
    final reason => AccountDeniedException(reason, description),
  };
}
