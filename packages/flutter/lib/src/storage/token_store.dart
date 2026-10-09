/// 앱을 다시 켜도 남아 있는 서비스 세션.
class StoredSession {
  const StoredSession({required this.accessToken, this.refreshToken});

  final String accessToken;
  final String? refreshToken;
}

/// [AccountClient] 가 세션과 로그아웃 여부를 보관하는 곳.
abstract interface class TokenStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();

  Future<bool> readLoggedOut();

  Future<void> writeLoggedOut(bool value);
}
