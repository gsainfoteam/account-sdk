/** id_token 을 받게 하는 OpenID Connect scope. 이 scope 가 있으면 `nonce` 가 필요하다. */
export const OPENID_SCOPE = 'openid';
/** refresh token 을 받게 하는 OpenID Connect scope. 이 scope 가 있으면 `prompt=consent` 가 필요하다. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/**
 * 사용자 정보에 접근하게 해 주는 scope.
 *
 * @remarks
 * IdP 가 받는 scope 의 유일한 출처다. account-be 는 이 목록으로 요청을 검증하고 discovery 에 광고하며,
 * SDK 의 TypeScript 타입과 Dart enum 도 여기서 나온다. scope 를 추가하거나 빼려면 여기를 고치고
 * 이 패키지를 배포한 뒤 account-be 와 SDK 가 새 버전을 받게 한다.
 */
export const CLIENT_SCOPES = [
  'profile',
  'name',
  'picture',
  'email',
  'phone_number',
  'student_id',
] as const;
/** 어떤 토큰이 발급될지를 바꾸는 scope. */
export const TOKEN_SCOPES = [OPENID_SCOPE, OFFLINE_ACCESS_SCOPE] as const;
/** IdP 가 받는 모든 scope. */
export const SCOPES = [...CLIENT_SCOPES, ...TOKEN_SCOPES] as const;

export type ClientScope = (typeof CLIENT_SCOPES)[number];
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export type Scope = (typeof SCOPES)[number];
