import idp from './idp.json' with { type: 'json' };

/**
 * IdP 배포별 API origin.
 *
 * Flutter 패키지와 함께 쓰는 값은 `idp.json` 에서 가져오고, 둘이 같은지는 Flutter 테스트가 확인한다.
 */
export const ENVIRONMENTS: Readonly<typeof idp.environments> = idp.environments;
/** IdP 는 API 를 `api.<host>` 에서, 로그인 페이지를 `<host>` 에서 제공한다. */
export const API_HOST_PREFIX: string = idp.apiHostPrefix;
export const DISCOVERY_PATH: string = idp.discoveryPath;
/** client 의 공개 등록 정보. `{clientId}` 를 바꿔 쓴다. */
export const CLIENT_REGISTRATION_PATH: string = idp.clientRegistrationPath;
/** discovery 문서에 빠져 있을 때 쓰는 endpoint. */
export const FALLBACK_ENDPOINTS: Readonly<typeof idp.fallbackEndpoints> = idp.fallbackEndpoints;
export const DEFAULT_ID_TOKEN_SIGNING_ALGS: readonly string[] = idp.idTokenSigningAlgs;
/** account-be 의 authorization code 수명. 이보다 오래된 트랜잭션은 교환할 수 없다. */
export const AUTHORIZATION_CODE_TTL_MS: number = idp.authorizationCodeTtlSeconds * 1000;
/** 서비스 백엔드 세션 endpoint 의 기본 경로. ziggle-be 와 house-moving-out-be 를 따른다. */
export const SESSION_PATHS: Readonly<typeof idp.sessionPaths> = idp.sessionPaths;
/** redirect URI 를 주지 않았을 때 IdP 에 등록할 callback 경로. */
export const CALLBACK_PATH: string = idp.callbackPath;
/** SDK 가 저장소에 쓰는 모든 키의 접두어. */
export const STORAGE_NAMESPACE: string = idp.storageNamespace;

export const CODE_CHALLENGE_METHOD = 'S256';
/** id_token 의 시각을 확인할 때 허용하는 시계 오차. */
export const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;
/** 캐시한 client credentials 토큰을 만료 몇 밀리초 전에 교체할지. */
export const CLIENT_TOKEN_REFRESH_MARGIN_MS = 60_000;
export const UNAUTHORIZED_STATUS = 401;
export const AUTH_FAILURE_STATUSES: readonly number[] = [UNAUTHORIZED_STATUS, 403];
