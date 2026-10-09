/// Deployments of the IdP, by the origin of their API.
///
/// Mirrors `environments` in `packages/core/src/constants/idp.json`; a test fails when they drift.
enum AccountEnvironment {
  production('https://api.account.gistory.me'),
  staging('https://api.stg.account.gistory.me');

  const AccountEnvironment(this.apiOrigin);

  final String apiOrigin;
}

/// Values shared with the TypeScript packages.
///
/// Each mirrors a field of `packages/core/src/constants/idp.json`, and a test fails when they drift.
abstract final class AccountConstants {
  /// The IdP serves its API on `api.<host>` and its login page on `<host>`.
  static const apiHostPrefix = 'api.';
  static const discoveryPath = '/.well-known/openid-configuration';

  /// Used when the discovery document leaves `userinfo_endpoint` out.
  static const fallbackUserinfoPath = '/oauth/userinfo';
  static const storageNamespace = 'gsainfoteam-account';

  /// Random bytes in an OAuth `state` value.
  static const stateByteLength = 32;
  static const authFailureStatuses = {401, 403};
  static const unauthorizedStatus = 401;
}
