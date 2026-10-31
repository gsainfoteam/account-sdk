import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

import 'support/json.dart';

void main() {
  final idp = jsonObject(File('../core/src/constants/idp.json').readAsStringSync());

  test('matches the IdP constants the TypeScript packages use', () {
    expect({
      for (final environment in AccountEnvironment.values) environment.name: environment.apiOrigin,
    }, idp['environments']);
    expect(AccountConstants.apiHostPrefix, idp['apiHostPrefix']);
    expect(AccountConstants.discoveryPath, idp['discoveryPath']);
    expect(AccountConstants.clientRegistrationPath, idp['clientRegistrationPath']);
    expect(AccountConstants.storageNamespace, idp['storageNamespace']);
    const paths = SessionPaths();
    expect({
      'login': paths.login,
      'refresh': paths.refresh,
      'logout': paths.logout,
    }, idp['sessionPaths']);
  });

  test('knows every scope the IdP advertises except openid', () {
    final discovery = jsonObject(
      File('../core/tests/fixtures/discovery.production.json').readAsStringSync(),
    );
    expect(
      discovery['scopes_supported'],
      unorderedEquals([...AccountScope.values.map((scope) => scope.value), 'openid']),
    );
  });

  test('parses OAuth error codes and denial reasons from their wire values', () {
    expect(OAuthErrorCode.parse('invalid_grant'), OAuthErrorCode.invalidGrant);
    expect(OAuthErrorCode.parse('something_new'), OAuthErrorCode.unknown);
    expect(AccountDenialReason.parse('user_cancelled'), AccountDenialReason.userCancelled);
    expect(AccountDenialReason.parse(null), AccountDenialReason.other);
  });
}
