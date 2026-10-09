import { AUTH_FAILURE_STATUSES } from '../constants';

const SCHEME = 'Bearer ';

export const AUTHORIZATION_HEADER = 'authorization';

export function bearer(token: string): string {
  return SCHEME + token;
}

export function readBearer(header: string | null | undefined): string | null {
  return header?.startsWith(SCHEME) ? header.slice(SCHEME.length) || null : null;
}

export function isUnauthorized(status: number | undefined): boolean {
  return status === 401;
}

export function isAuthFailure(status: number | undefined): boolean {
  return status !== undefined && AUTH_FAILURE_STATUSES.includes(status);
}
