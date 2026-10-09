import { AUTH_FAILURE_STATUSES } from '../constants';

const SCHEME = 'Bearer ';

export const AUTHORIZATION_HEADER = 'authorization';

/** Formats an `Authorization` header value for `token`. */
export function bearer(token: string): string {
  return SCHEME + token;
}

/** Reads the token out of an `Authorization` header value, or `null` when it is not a bearer token. */
export function readBearer(header: string | null | undefined): string | null {
  return header?.startsWith(SCHEME) ? header.slice(SCHEME.length) || null : null;
}

/** Tells whether a status means the access token was rejected, so refreshing it may help. */
export function isUnauthorized(status: number | undefined): boolean {
  return status === 401;
}

/** Tells whether a status means the request was not authenticated or not allowed (401 or 403). */
export function isAuthFailure(status: number | undefined): boolean {
  return status !== undefined && AUTH_FAILURE_STATUSES.includes(status);
}
