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
import 'account_state.dart';
import 'scopes.dart';

typedef BrowserAuthenticator = Future<String> Function(Uri url, String callbackUrlScheme);

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

  final ReadWriteMutex mutex = ReadWriteMutex();
  final _state = BehaviorSubject.seeded(const AccountState(AccountStatus.loading));

  Stream<AccountState> get states => _state.stream;
  AccountState get state => _state.value;
  String? get accessToken => _state.value.accessToken;

  Future<void> restore() async {
    final stored = await _store.read();
    _state.add(
      stored == null
          ? const AccountState(AccountStatus.unauthenticated)
          : AccountState(AccountStatus.authenticated, stored.accessToken),
    );
  }

  Future<void> signIn() async {
    final metadata = await discover(issuer, client: _http);
    final grant = oauth2.AuthorizationCodeGrant(
      clientId,
      metadata.authorizationEndpoint,
      metadata.tokenEndpoint,
      httpClient: _http,
    );
    final state = _randomState();
    var url = grant.getAuthorizationUrl(
      redirectUri,
      scopes: scopes.map((scope) => scope.value),
      state: state,
    );
    final prompt = await _prompt();
    if (prompt != null) {
      url = url.replace(queryParameters: {...url.queryParameters, 'prompt': prompt});
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

  Future<void> signOut() async {
    final stored = await _store.read();
    await _store.clear();
    await _store.writeSignedOut(true);
    _state.add(const AccountState(AccountStatus.unauthenticated));
    try {
      await session.logout(accessToken: stored?.accessToken, refreshToken: stored?.refreshToken);
    } on AccountException {
      // 서버 쪽 정리가 실패해도 이 기기에서는 이미 로그아웃됐다.
    }
  }

  // 401 을 받은 요청들이 동시에 부르면 한 번만 갱신하고, 기다린 요청들은 그 결과를 쓴다.
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

  // 로그아웃해도 IdP 로그인 세션은 남는다. 다른 계정으로 바꿀 수 있게 로그아웃 직후 한 번은 로그인 화면을 띄운다.
  // offline_access 는 account-fe 가 prompt=consent 나 login 일 때만 받는다.
  Future<String?> _prompt() async {
    if (await _store.readSignedOut()) return 'login';
    if (scopes.contains(AccountScope.offlineAccess)) return 'consent';
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
  if (error.error != 'access_denied') {
    return AccountOAuthException(error.error, error.description);
  }
  return switch (error.description) {
    'user_cancelled' => const AccountCancelledException(),
    'verification_required' => AccountDeniedException(
      AccountDenialReason.verificationRequired,
      error.description,
    ),
    'consent_required' => AccountDeniedException(
      AccountDenialReason.consentRequired,
      error.description,
    ),
    'login_required' => AccountDeniedException(
      AccountDenialReason.loginRequired,
      error.description,
    ),
    _ => AccountDeniedException(AccountDenialReason.other, error.description),
  };
}
