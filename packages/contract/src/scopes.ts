/** 이 scope가 있으면 `nonce`가 필요하다. */
export const OPENID_SCOPE = 'openid';
/** 이 scope가 있으면 `prompt=consent`가 필요하다. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/**
 * 이 목록은 IdP가 받는 scope의 유일한 출처다. account-be의 검증과 discovery, SDK의 TypeScript 타입과 Dart enum이
 * 여기서 나오므로, 이 목록을 바꾸면 이 패키지를 배포한 뒤 account-be와 SDK가 새 버전을 받게 한다.
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
