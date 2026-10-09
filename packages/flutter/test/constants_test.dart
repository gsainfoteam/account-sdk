import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';

void main() {
  final idp =
      jsonDecode(File('../core/src/constants/idp.json').readAsStringSync()) as Map<String, Object?>;

  test('matches the IdP constants the TypeScript packages use', () {
    expect({
      for (final environment in AccountEnvironment.values) environment.name: environment.apiOrigin,
    }, idp['environments']);
    expect(AccountConstants.apiHostPrefix, idp['apiHostPrefix']);
    expect(AccountConstants.discoveryPath, idp['discoveryPath']);
    expect(
      AccountConstants.fallbackUserinfoPath,
      (idp['fallbackEndpoints']! as Map<String, Object?>)['userinfo'],
    );
    expect(AccountConstants.storageNamespace, idp['storageNamespace']);
    const paths = SessionPaths();
    expect({
      'login': paths.login,
      'refresh': paths.refresh,
      'logout': paths.logout,
    }, idp['sessionPaths']);
  });

  test('parses OAuth error codes and denial reasons from their wire values', () {
    expect(OAuthErrorCode.parse('invalid_grant'), OAuthErrorCode.invalidGrant);
    expect(OAuthErrorCode.parse('something_new'), OAuthErrorCode.unknown);
    expect(AccountDenialReason.parse('consent_required'), AccountDenialReason.consentRequired);
    expect(AccountDenialReason.parse(null), AccountDenialReason.other);
  });
}
