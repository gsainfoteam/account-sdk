/** 이 scope 가 있으면 `nonce` 가 필요하다. */
export const OPENID_SCOPE = 'openid';
/** 이 scope 가 있으면 `prompt=consent` 가 필요하다. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/**
 * IdP 가 받는 scope 의 유일한 출처다. account-be 의 검증과 discovery, SDK 의 TypeScript 타입과 Dart enum 이 여기서
 * 나오므로, 바꾸면 이 패키지를 배포한 뒤 account-be 와 SDK 가 새 버전을 받게 한다.
 */
export const CLIENT_SCOPES = [
  'profile',
  'name',
  'picture',
  'email',
  'phone_number',
  'student_id',
] as const;
export const TOKEN_SCOPES = [OPENID_SCOPE, OFFLINE_ACCESS_SCOPE] as const;
export const SCOPES = [...CLIENT_SCOPES, ...TOKEN_SCOPES] as const;

export type ClientScope = (typeof CLIENT_SCOPES)[number];
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export type Scope = (typeof SCOPES)[number];
