import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

Object? fixture(String name) =>
    jsonDecode(File('../core/tests/fixtures/discovery.$name.json').readAsStringSync());

void main() {
  test('keeps the production endpoints', () {
    final metadata = normalizeDiscovery(fixture('production'));
    expect(metadata.authorizationEndpoint.toString(), 'https://account.gistory.me/authorize');
    expect(metadata.tokenEndpoint.toString(), 'https://api.account.gistory.me/oauth/token');
    expect(metadata.issuer, 'https://account.gistory.me');
    expect(metadata.scopesSupported, contains('student_id'));
  });

  test('rejects a document without absolute endpoints', () {
    expect(() => normalizeDiscovery({'issuer': 'x'}), throwsA(isA<AccountDiscoveryException>()));
    expect(
      () => normalizeDiscovery({
        ...fixture('production')! as Map<String, Object?>,
        'authorization_endpoint': '/authorize',
      }),
      throwsA(isA<AccountDiscoveryException>()),
    );
  });
}
