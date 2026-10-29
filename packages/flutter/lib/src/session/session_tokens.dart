import '../errors/account_exception.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, this.refreshToken, this.expiresIn});

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
