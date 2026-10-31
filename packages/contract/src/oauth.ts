export const AUTHORIZE_ERROR_CODES = [
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'login_required',
  'consent_required',
  'interaction_required',
] as const;

export const TOKEN_ONLY_ERROR_CODES = [
  'invalid_client',
  'invalid_grant',
  'unsupported_grant_type',
] as const;

export const OAUTH_ERROR_CODES = [...AUTHORIZE_ERROR_CODES, ...TOKEN_ONLY_ERROR_CODES] as const;

export type AuthorizeErrorCode = (typeof AUTHORIZE_ERROR_CODES)[number];
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

/** `select_account`는 account-fe가 처리하지 않아서 뺐다. */
export const PROMPTS = ['none', 'login', 'consent'] as const;
export type Prompt = (typeof PROMPTS)[number];

/** account-be는 `plain`을 받지 않는다. */
export const CODE_CHALLENGE_METHOD = 'S256';

export const TOKEN_ENDPOINT_AUTH_METHODS = [
  'none',
  'client_secret_basic',
  'client_secret_post',
] as const;
export type TokenEndpointAuthMethod = (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

export const GRANT_TYPES = ['authorization_code', 'refresh_token', 'client_credentials'] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const AMR = {
  password: ['pwd'],
  passkey: ['hwk', 'user'],
} as const;
export type AmrValue = (typeof AMR)[keyof typeof AMR][number];

export const IDP_PAGE_PATHS = {
  authorize: '/authorize',
  logout: '/logout',
} as const;
