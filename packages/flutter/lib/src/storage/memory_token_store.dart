import 'token_store.dart';

/// [TokenStore] that forgets everything when the app exits. For tests.
class MemoryTokenStore implements TokenStore {
  StoredSession? _session;
  bool _loggedOut = false;

  @override
  Future<StoredSession?> read() async => _session;

  @override
  Future<void> write(StoredSession session) async => _session = session;

  @override
  Future<void> clear() async => _session = null;

  @override
  Future<bool> readLoggedOut() async => _loggedOut;

  @override
  Future<void> writeLoggedOut(bool value) async => _loggedOut = value;
}
