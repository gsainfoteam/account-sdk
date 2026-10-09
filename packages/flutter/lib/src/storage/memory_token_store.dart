import 'token_store.dart';

/// 앱이 끝나면 모두 잊는 [TokenStore]. 테스트용이다.
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
