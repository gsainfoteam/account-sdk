import { AUTH_FAILURE_STATUSES, UNAUTHORIZED_STATUS } from '../constants';

const SCHEME = 'Bearer ';

export const AUTHORIZATION_HEADER = 'authorization';

export function bearer(token: string): string {
  return SCHEME + token;
}

export function readBearer(header: string | null | undefined): string | null {
  return header?.startsWith(SCHEME) ? header.slice(SCHEME.length) || null : null;
}

/** refresh 하면 나아질 수 있는 거절인지 알려 준다. */
export function isUnauthorized(status: number | undefined): boolean {
  return status === UNAUTHORIZED_STATUS;
}

export function isAuthFailure(status: number | undefined): boolean {
  return status !== undefined && AUTH_FAILURE_STATUSES.includes(status);
}
