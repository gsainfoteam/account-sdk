import idp from './idp.json' with { type: 'json' };

/**
 * API origins of the IdP deployments.
 *
 * Values shared with the Flutter package come from `idp.json`, and a Flutter test keeps the two in sync.
 */
export const ENVIRONMENTS: Readonly<typeof idp.environments> = idp.environments;
/** The IdP serves its API on `api.<host>` and its login page on `<host>`. */
export const API_HOST_PREFIX: string = idp.apiHostPrefix;
export const DISCOVERY_PATH: string = idp.discoveryPath;
/** Endpoints used when the discovery document leaves them out. */
export const FALLBACK_ENDPOINTS: Readonly<typeof idp.fallbackEndpoints> = idp.fallbackEndpoints;
export const DEFAULT_ID_TOKEN_SIGNING_ALGS: readonly string[] = idp.idTokenSigningAlgs;
/** Lifetime of an authorization code in account-be. A transaction older than this cannot be exchanged. */
export const AUTHORIZATION_CODE_TTL_MS: number = idp.authorizationCodeTtlSeconds * 1000;
/** Default paths of a service backend's session endpoints, following ziggle-be and house-moving-out-be. */
export const SESSION_PATHS: Readonly<typeof idp.sessionPaths> = idp.sessionPaths;
/** Prefix of every key the SDK writes to storage. */
export const STORAGE_NAMESPACE: string = idp.storageNamespace;

export const CODE_CHALLENGE_METHOD = 'S256';
/** Clock skew allowed when checking id_token times. */
export const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;
/** How long before expiry a cached client credentials token is replaced. */
export const CLIENT_TOKEN_REFRESH_MARGIN_MS = 60_000;
export const UNAUTHORIZED_STATUS = 401;
export const AUTH_FAILURE_STATUSES: readonly number[] = [UNAUTHORIZED_STATUS, 403];
