import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

void main() {
  final idp = jsonDecode(File('../core/src/constants/idp.json').readAsStringSync()) as Map;

  test('matches the IdP constants the TypeScript packages use', () {
    expect(AccountConstants.environments, idp['environments']);
    expect(AccountConstants.apiHostPrefix, idp['apiHostPrefix']);
    expect(AccountConstants.discoveryPath, idp['discoveryPath']);
    expect(AccountConstants.fallbackEndpoints, idp['fallbackEndpoints']);
    expect(AccountConstants.idTokenSigningAlgs, idp['idTokenSigningAlgs']);
    expect(AccountConstants.authorizationCodeTtlSeconds, idp['authorizationCodeTtlSeconds']);
    expect(AccountConstants.sessionPaths, idp['sessionPaths']);
    expect(AccountConstants.storageNamespace, idp['storageNamespace']);
  });

  test('knows every scope the IdP advertises except openid', () {
    final discovery =
        jsonDecode(File('../core/tests/fixtures/discovery.production.json').readAsStringSync())
            as Map;
    final advertised = (discovery['scope_supported'] as List).cast<String>().toSet()
      ..remove('openid');
    expect(AccountScope.values.map((scope) => scope.value).toSet(), advertised);
  });
}
