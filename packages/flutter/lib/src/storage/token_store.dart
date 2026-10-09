class StoredSession {
  const StoredSession({required this.accessToken, this.refreshToken});

  final String accessToken;
  final String? refreshToken;
}

abstract interface class TokenStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();

  Future<bool> readSignedOut();

  Future<void> writeSignedOut(bool value);
}
