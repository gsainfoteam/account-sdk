import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

void main() {
  test('reads the tokens a service backend returns', () {
    final tokens = SessionTokens.fromJson({
      'access_token': 'at',
      'refresh_token': 'rt',
      'expires_in': 3600,
    });
    expect(tokens.accessToken, 'at');
    expect(tokens.refreshToken, 'rt');
    expect(tokens.expiresIn, const Duration(hours: 1));
  });

  test('ignores optional fields of the wrong type', () {
    final tokens = SessionTokens.fromJson({
      'access_token': 'at',
      'refresh_token': 1,
      'expires_in': '1h',
    });
    expect(tokens.refreshToken, isNull);
    expect(tokens.expiresIn, isNull);
  });

  test('rejects a body without an access token', () {
    for (final body in [
      null,
      'at',
      <String, Object?>{},
      {'access_token': ''},
      {'access_token': 1},
    ]) {
      expect(() => SessionTokens.fromJson(body), throwsA(isA<AccountSessionRejectedException>()));
    }
  });
}
