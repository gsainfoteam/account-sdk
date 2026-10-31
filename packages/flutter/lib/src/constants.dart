/// `packages/core/src/constants/idp.json`의 `environments`와 같아야 하고, 어긋나면 테스트가 실패한다.
enum AccountEnvironment {
  production('https://api.account.gistory.me'),
  staging('https://api.stg.account.gistory.me');

  const AccountEnvironment(this.apiOrigin);

  final String apiOrigin;
}

/// 각각 `packages/core/src/constants/idp.json`의 필드와 같아야 하고, 어긋나면 테스트가 실패한다.
abstract final class AccountConstants {
  /// IdP는 API를 `api.<host>`에서, 로그인 페이지를 `<host>`에서 제공한다.
  static const apiHostPrefix = 'api.';
  static const discoveryPath = '/.well-known/openid-configuration';

  static const clientRegistrationPath = '/client/{clientId}/public';

  static const storageNamespace = 'gsainfoteam-account';

  /// OAuth `state`, `nonce`, PKCE verifier에 넣는 무작위 바이트 수다.
  static const randomByteLength = 32;
  static const authFailureStatuses = {401, 403};
  static const unauthorizedStatus = 401;
}
