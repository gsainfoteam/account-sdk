import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'token_store.dart';

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage, this.prefix = 'gsainfoteam_account'])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  final String prefix;

  String get _access => '$prefix.access_token';
  String get _refresh => '$prefix.refresh_token';
  String get _signedOut => '$prefix.signed_out';

  @override
  Future<StoredSession?> read() async {
    final accessToken = await _storage.read(key: _access);
    if (accessToken == null) return null;
    return StoredSession(
      accessToken: accessToken,
      refreshToken: await _storage.read(key: _refresh),
    );
  }

  @override
  Future<void> write(StoredSession session) async {
    await _storage.write(key: _access, value: session.accessToken);
    if (session.refreshToken != null) {
      await _storage.write(key: _refresh, value: session.refreshToken);
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }

  @override
  Future<bool> readSignedOut() async => await _storage.read(key: _signedOut) != null;

  @override
  Future<void> writeSignedOut(bool value) async {
    if (value) {
      await _storage.write(key: _signedOut, value: '1');
    } else {
      await _storage.delete(key: _signedOut);
    }
  }
}
