import 'package:dio/dio.dart';

import '../constants.dart';
import '../errors/account_exception.dart';
import '../http/bearer.dart';
import '../http/dio_interceptor.dart';
import 'session_adapter.dart';
import 'session_tokens.dart';

// pot-g-be 의 규약. 앱은 쿠키를 쓰지 않으므로 refresh token 을 body 로 주고받는다.
class BodySession implements SessionAdapter {
  BodySession({
    required this.dio,
    String? loginPath,
    String? refreshPath,
    String? logoutPath,
    this.loginBody,
  }) : loginPath = loginPath ?? AccountConstants.sessionPaths['login']!,
       refreshPath = refreshPath ?? AccountConstants.sessionPaths['refresh']!,
       logoutPath = logoutPath ?? AccountConstants.sessionPaths['logout']!;

  final Dio dio;
  final String loginPath;
  final String refreshPath;
  final String logoutPath;
  final Future<Map<String, Object?>> Function()? loginBody;

  @override
  Future<SessionTokens> login(String idpAccessToken) async {
    final extra = await loginBody?.call() ?? const {};
    return SessionTokens.fromJson(await _post(loginPath, {'token': idpAccessToken, ...extra}));
  }

  @override
  Future<SessionTokens?> refresh(String refreshToken) async {
    try {
      return SessionTokens.fromJson(await _post(refreshPath, {'refresh_token': refreshToken}));
    } on AccountSessionRejectedException catch (error) {
      if (AccountConstants.authFailureStatuses.contains(error.statusCode)) return null;
      rethrow;
    }
  }

  @override
  Future<void> logout({String? accessToken, String? refreshToken}) async {
    await _post(
      logoutPath,
      {'refresh_token': refreshToken ?? ''},
      headers: {if (accessToken != null) authorizationHeader: bearer(accessToken)},
    );
  }

  Future<Object?> _post(
    String path,
    Map<String, Object?> body, {
    Map<String, String>? headers,
  }) async {
    try {
      final response = await dio.post<Object?>(
        path,
        data: body,
        options: Options(headers: headers, extra: SkipAccountAuth.extra),
      );
      return response.data;
    } on DioException catch (error) {
      final response = error.response;
      if (response == null) throw AccountNetworkException(error);
      throw AccountSessionRejectedException(response.statusCode, response.data);
    }
  }
}
