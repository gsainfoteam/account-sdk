import 'session_tokens.dart';

abstract interface class SessionAdapter {
  Future<SessionTokens> login(String idpAccessToken);

  Future<SessionTokens?> refresh(String refreshToken);

  Future<void> logout({String? accessToken, String? refreshToken});
}
