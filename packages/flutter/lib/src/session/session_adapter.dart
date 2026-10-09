import 'session_tokens.dart';

/// 서비스 백엔드의 세션을 시작하고, 갱신하고, 끝낸다.
///
/// [BodySession] 을 쓴다. 요청이나 응답 모양이 다른 백엔드라면 이 인터페이스를 직접 구현한다.
abstract interface class SessionAdapter {
  Future<SessionTokens> start(String idpAccessToken);

  /// refresh token 이 더는 유효하지 않으면 `null` 을 돌려준다.
  Future<SessionTokens?> refresh(String refreshToken);

  Future<void> end({String? accessToken, String? refreshToken});
}
