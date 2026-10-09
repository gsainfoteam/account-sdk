abstract final class AccountConstants {
  static const environments = {
    'production': 'https://api.account.gistory.me',
    'staging': 'https://api.stg.account.gistory.me',
  };
  static const apiHostPrefix = 'api.';
  static const discoveryPath = '/.well-known/openid-configuration';
  static const fallbackEndpoints = {'userinfo': '/oauth/userinfo', 'revocation': '/oauth/token'};
  static const idTokenSigningAlgs = ['ES256'];
  static const authorizationCodeTtlSeconds = 600;
  static const sessionPaths = {
    'login': '/auth/login',
    'refresh': '/auth/refresh',
    'logout': '/auth/logout',
  };
  static const storageNamespace = 'gsainfoteam-account';

  static const stateByteLength = 32;
  static const authFailureStatuses = {401, 403};
  static const unauthorizedStatus = 401;
}
