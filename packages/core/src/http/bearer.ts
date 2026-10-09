import { AUTH_FAILURE_STATUSES, UNAUTHORIZED_STATUS } from '../constants';

const SCHEME = 'Bearer ';

export const AUTHORIZATION_HEADER = 'authorization';

/** `token` 으로 `Authorization` 헤더 값을 만든다. */
export function bearer(token: string): string {
  return SCHEME + token;
}

/** `Authorization` 헤더 값에서 토큰을 꺼낸다. bearer 토큰이 아니면 `null` 이다. */
export function readBearer(header: string | null | undefined): string | null {
  return header?.startsWith(SCHEME) ? header.slice(SCHEME.length) || null : null;
}

/** status 가 access token 거절, 즉 refresh 하면 나아질 수 있는 경우인지 알려 준다. */
export function isUnauthorized(status: number | undefined): boolean {
  return status === UNAUTHORIZED_STATUS;
}

/** status 가 인증 실패나 권한 없음(401, 403)인지 알려 준다. */
export function isAuthFailure(status: number | undefined): boolean {
  return status !== undefined && AUTH_FAILURE_STATUSES.includes(status);
}
