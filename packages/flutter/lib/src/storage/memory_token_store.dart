import 'token_store.dart';

class MemoryTokenStore implements TokenStore {
  StoredSession? _session;
  bool _signedOut = false;

  @override
  Future<StoredSession?> read() async => _session;

  @override
  Future<void> write(StoredSession session) async => _session = session;

  @override
  Future<void> clear() async => _session = null;

  @override
  Future<bool> readSignedOut() async => _signedOut;

  @override
  Future<void> writeSignedOut(bool value) async => _signedOut = value;
}
