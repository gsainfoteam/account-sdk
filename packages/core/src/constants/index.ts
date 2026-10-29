import idp from './idp.json' with { type: 'json' };

/** Flutter 패키지와 함께 쓰는 값은 `idp.json` 에서 가져오고, 둘이 같은지는 Flutter 테스트가 확인한다. */
export const ENVIRONMENTS: Readonly<typeof idp.environments> = idp.environments;
export const API_HOST_PREFIX: string = idp.apiHostPrefix;
export const DISCOVERY_PATH: string = idp.discoveryPath;
export const CLIENT_REGISTRATION_PATH: string = idp.clientRegistrationPath;
export const FALLBACK_ENDPOINTS: Readonly<typeof idp.fallbackEndpoints> = idp.fallbackEndpoints;
export const DEFAULT_ID_TOKEN_SIGNING_ALGS: readonly string[] = idp.idTokenSigningAlgs;
export const AUTHORIZATION_CODE_TTL_MS: number = idp.authorizationCodeTtlSeconds * 1000;
/** ziggle-be 와 house-moving-out-be 를 따른다. */
export const SESSION_PATHS: Readonly<typeof idp.sessionPaths> = idp.sessionPaths;
export const CALLBACK_PATH: string = idp.callbackPath;
export const STORAGE_NAMESPACE: string = idp.storageNamespace;

export const CODE_CHALLENGE_METHOD = 'S256';
export const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;
export const CLIENT_TOKEN_REFRESH_MARGIN_MS = 60_000;
export const UNAUTHORIZED_STATUS = 401;
export const AUTH_FAILURE_STATUSES: readonly number[] = [UNAUTHORIZED_STATUS, 403];
