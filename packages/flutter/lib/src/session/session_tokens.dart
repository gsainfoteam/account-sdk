import '../errors/account_exception.dart';

/// 서비스 백엔드가 로그인과 refresh 에서 돌려주는 토큰.
class SessionTokens {
  const SessionTokens({required this.accessToken, this.refreshToken, this.expiresIn});

  /// `access_token`, `refresh_token`, `expires_in` 을 읽는다. access token 이 없으면 [AccountSessionRejectedException] 을 던진다.
  factory SessionTokens.fromJson(Object? json) {
    if (json case {'access_token': final String accessToken} when accessToken.isNotEmpty) {
      return SessionTokens(
        accessToken: accessToken,
        refreshToken: switch (json['refresh_token']) {
          final String token when token.isNotEmpty => token,
          _ => null,
        },
        expiresIn: switch (json['expires_in']) {
          final num seconds => Duration(seconds: seconds.toInt()),
          _ => null,
        },
      );
    }
    throw AccountSessionRejectedException(null, json);
  }

  final String accessToken;
  final String? refreshToken;
  final Duration? expiresIn;
}
