/// Values shared with the TypeScript packages.
///
/// The IdP-facing values mirror `packages/core/src/constants/idp.json`, and a test fails when they drift.
abstract final class AccountConstants {
  static const environments = {
    'production': 'https://api.account.gistory.me',
    'staging': 'https://api.stg.account.gistory.me',
  };

  /// The IdP serves its API on `api.<host>` and its login page on `<host>`.
  static const apiHostPrefix = 'api.';
  static const discoveryPath = '/.well-known/openid-configuration';
  static const fallbackEndpoints = {'userinfo': '/oauth/userinfo', 'revocation': '/oauth/token'};
  static const idTokenSigningAlgs = ['ES256'];
  static const authorizationCodeTtlSeconds = 600;

  /// Default paths of a service backend's session endpoints.
  static const sessionPaths = {
    'login': '/auth/login',
    'refresh': '/auth/refresh',
    'logout': '/auth/logout',
  };
  static const storageNamespace = 'gsainfoteam-account';

  /// Random bytes in an OAuth `state` value.
  static const stateByteLength = 32;
  static const authFailureStatuses = {401, 403};
  static const unauthorizedStatus = 401;
}
