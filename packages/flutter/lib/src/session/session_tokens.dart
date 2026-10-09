import '../errors/account_exception.dart';

/// Tokens a service backend returns from login and refresh.
class SessionTokens {
  const SessionTokens({required this.accessToken, this.refreshToken, this.expiresIn});

  /// Reads `access_token`, `refresh_token` and `expires_in`. Throws [AccountSessionRejectedException] without an access token.
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
