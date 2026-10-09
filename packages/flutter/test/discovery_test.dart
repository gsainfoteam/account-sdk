import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

Object? fixture(String name) =>
    jsonDecode(File('../core/tests/fixtures/discovery.$name.json').readAsStringSync());

void main() {
  test('keeps the production endpoints', () {
    final metadata = normalizeDiscovery(
      fixture('production'),
      AccountIssuer.production.discoveryUrl,
    );
    expect(metadata.authorizationEndpoint.toString(), 'https://account.gistory.me/authorize');
    expect(metadata.tokenEndpoint.toString(), 'https://api.account.gistory.me/oauth/token');
    expect(metadata.issuers, ['https://account.gistory.me', 'https://api.account.gistory.me']);
    expect(metadata.scopesSupported, contains('student_id'));
  });

  test('rebuilds the broken staging endpoints from the host it was fetched from', () {
    final metadata = normalizeDiscovery(fixture('staging'), AccountIssuer.staging.discoveryUrl);
    expect(metadata.authorizationEndpoint.toString(), 'https://stg.account.gistory.me/authorize');
    expect(metadata.tokenEndpoint.toString(), 'https://api.stg.account.gistory.me/oauth/token');
    expect(metadata.issuers, contains('https://api.stg.account.gistory.me'));
  });

  test('rejects a document without endpoints', () {
    expect(
      () => normalizeDiscovery({'issuer': 'x'}, AccountIssuer.production.discoveryUrl),
      throwsA(isA<AccountDiscoveryException>()),
    );
  });
}
