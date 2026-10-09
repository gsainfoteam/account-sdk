import '../errors/account_exception.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, this.refreshToken, this.expiresIn});

  factory SessionTokens.fromJson(Object? json) {
    if (json is! Map ||
        json['access_token'] is! String ||
        (json['access_token'] as String).isEmpty) {
      throw AccountSessionRejectedException(null, json);
    }
    final refreshToken = json['refresh_token'];
    final expiresIn = json['expires_in'];
    return SessionTokens(
      accessToken: json['access_token'] as String,
      refreshToken: refreshToken is String && refreshToken.isNotEmpty ? refreshToken : null,
      expiresIn: expiresIn is num ? Duration(seconds: expiresIn.toInt()) : null,
    );
  }

  final String accessToken;
  final String? refreshToken;
  final Duration? expiresIn;
}
