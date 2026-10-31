/** RFC 6749 4.1.2.1과 OIDC Core 3.1.2.6의 코드다. account-be는 authorize 실패를 이 코드로 client에 redirect 한다. */
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

/** RFC 6749 5.2의 코드 중 authorize 응답에는 없는 것이다. */
export const TOKEN_ONLY_ERROR_CODES = [
  'invalid_client',
  'invalid_grant',
  'unsupported_grant_type',
] as const;

export const OAUTH_ERROR_CODES = [...AUTHORIZE_ERROR_CODES, ...TOKEN_ONLY_ERROR_CODES] as const;

export type AuthorizeErrorCode = (typeof AUTHORIZE_ERROR_CODES)[number];
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

/** OIDC Core 3.1.2.1의 값 중 account-fe가 처리하는 것이다. */
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

/** RFC 8176의 값이다. id_token의 `amr`은 로그인 방식에 따라 이 중 하나다. */
export const AMR = {
  password: ['pwd'],
  passkey: ['hwk', 'user'],
} as const;
export type AmrValue = (typeof AMR)[keyof typeof AMR][number];

/** account-fe의 화면 경로다. account-be는 discovery의 `authorization_endpoint`와 `end_session_endpoint`를 이 경로로 만든다. */
export const IDP_PAGE_PATHS = {
  authorize: '/authorize',
  logout: '/logout',
} as const;
