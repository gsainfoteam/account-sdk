/// The service session kept between app launches.
class StoredSession {
  const StoredSession({required this.accessToken, this.refreshToken});

  final String accessToken;
  final String? refreshToken;
}

/// Where [AccountClient] keeps the session and whether the user signed out.
abstract interface class TokenStore {
  Future<StoredSession?> read();

  Future<void> write(StoredSession session);

  Future<void> clear();

  Future<bool> readLoggedOut();

  Future<void> writeLoggedOut(bool value);
}
