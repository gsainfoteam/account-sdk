import 'package:dio/dio.dart';

import '../constants.dart';
import '../errors/account_exception.dart';
import '../http/bearer.dart';
import '../http/dio_interceptor.dart';
import 'session_adapter.dart';
import 'session_paths.dart';
import 'session_tokens.dart';

/// 요청과 응답 body 로 토큰을 주고받는 백엔드용 세션. pot-g-be 가 이 방식이다.
/// 앱에는 refresh token 을 넣어 둘 쿠키가 없다.
///
/// 로그인은 `{token: <IdP access token>, ...loginBody()}` 를, refresh 는 `{refresh_token}` 을 POST 한다.
/// 로그아웃은 서비스 토큰을 bearer 토큰으로 붙여 `{refresh_token}` 을 POST 한다. 경로 기본값은
/// [SessionPaths] 다.
class BodySession implements SessionAdapter {
  BodySession({required this.dio, this.paths = const SessionPaths(), this.loginBody});

  final Dio dio;
  final SessionPaths paths;

  /// 로그인에 더할 필드. pot-g-be 의 `device_id` 같은 것이다.
  final Future<Map<String, Object?>> Function()? loginBody;

  @override
  Future<SessionTokens> start(String idpAccessToken) async {
    final extra = await loginBody?.call() ?? const {};

    final response = await _post(paths.login, {'token': idpAccessToken, ...extra});
    return SessionTokens.fromJson(response);
  }

  @override
  Future<SessionTokens?> refresh(String refreshToken) async {
    try {
      final response = await _post(paths.refresh, {'refresh_token': refreshToken});
      return SessionTokens.fromJson(response);
    } on AccountSessionRejectedException catch (error) {
      if (AccountConstants.authFailureStatuses.contains(error.statusCode)) return null;
      rethrow;
    }
  }

  @override
  Future<void> end({String? accessToken, String? refreshToken}) async {
    await _post(
      paths.logout,
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
