import idp from './idp.json' with { type: 'json' };

export const ENVIRONMENTS: Readonly<typeof idp.environments> = idp.environments;
export const API_HOST_PREFIX: string = idp.apiHostPrefix;
export const DISCOVERY_PATH: string = idp.discoveryPath;
export const FALLBACK_ENDPOINTS: Readonly<typeof idp.fallbackEndpoints> = idp.fallbackEndpoints;
export const DEFAULT_ID_TOKEN_SIGNING_ALGS: readonly string[] = idp.idTokenSigningAlgs;
export const AUTHORIZATION_CODE_TTL_MS: number = idp.authorizationCodeTtlSeconds * 1000;
export const SESSION_PATHS: Readonly<typeof idp.sessionPaths> = idp.sessionPaths;
export const STORAGE_NAMESPACE: string = idp.storageNamespace;

export const CODE_CHALLENGE_METHOD = 'S256';
export const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;
export const CLIENT_TOKEN_REFRESH_MARGIN_MS = 60_000;
export const DEFAULT_CLIENT_CREDENTIALS_SCOPES = ['name', 'email'] as const;
export const AUTH_FAILURE_STATUSES: readonly number[] = [401, 403];
