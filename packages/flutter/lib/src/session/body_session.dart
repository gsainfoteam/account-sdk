import 'package:dio/dio.dart';

import '../constants.dart';
import '../errors/account_exception.dart';
import '../http/bearer.dart';
import '../http/dio_interceptor.dart';
import 'session_adapter.dart';
import 'session_paths.dart';
import 'session_tokens.dart';

/// Session for backends that exchange tokens in request and response bodies, as pot-g-be does.
/// Apps have no cookies to keep a refresh token in.
///
/// Login posts `{token: <IdP access token>, ...loginBody()}`, refresh posts `{refresh_token}`, and logout
/// posts `{refresh_token}` with the service token as a bearer token. Paths default to
/// [SessionPaths].
class BodySession implements SessionAdapter {
  BodySession({required this.dio, this.paths = const SessionPaths(), this.loginBody});

  final Dio dio;
  final SessionPaths paths;

  /// Extra login fields, such as pot-g-be's `device_id`.
  final Future<Map<String, Object?>> Function()? loginBody;

  @override
  Future<SessionTokens> login(String idpAccessToken) async {
    final extra = await loginBody?.call() ?? const {};
    return SessionTokens.fromJson(await _post(paths.login, {'token': idpAccessToken, ...extra}));
  }

  @override
  Future<SessionTokens?> refresh(String refreshToken) async {
    try {
      return SessionTokens.fromJson(await _post(paths.refresh, {'refresh_token': refreshToken}));
    } on AccountSessionRejectedException catch (error) {
      if (AccountConstants.authFailureStatuses.contains(error.statusCode)) return null;
      rethrow;
    }
  }

  @override
  Future<void> logout({String? accessToken, String? refreshToken}) async {
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
