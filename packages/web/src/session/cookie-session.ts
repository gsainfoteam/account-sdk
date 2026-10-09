import { AccountError, isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths } from './session-adapter';

export interface CookieSessionOptions {
  /** Origin or base path of the service API. A relative base such as `/api` works with a dev proxy. */
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
}

/**
 * Session for backends that log in with the IdP token as a bearer token and keep the refresh token
 * in an httpOnly cookie, as ziggle-be and house-moving-out-be do.
 *
 * Sends `POST {login}` with `Authorization: Bearer <IdP token>`, `POST {refresh}` with the cookie, and
 * `POST {logout}` with the service token. Every request sends credentials. Responses must carry `access_token`.
 *
 * @example
 * ```ts
 * cookieSession({ baseUrl: 'https://api.ziggle.gistory.me', paths: { refresh: '/auth/refresh-token' } });
 * ```
 */
export function cookieSession({
  baseUrl,
  paths = {},
  fetch,
}: CookieSessionOptions): SessionAdapter {
  const request = createRequester(baseUrl, fetch);
  const { login, refresh, logout } = { ...SESSION_PATHS, ...paths };

  return {
    async login(credential, body) {
      if (credential.type !== 'idp_token') {
        throw new AccountError('invalid_request', {
          description: "cookieSession needs exchange: 'browser'",
        });
      }
      return readTokens(
        await request({ path: login, accessToken: credential.accessToken, body }),
        login,
      );
    },
    async refresh() {
      const response = await request({ path: refresh });
      if (isAuthFailure(response.status)) return null;
      return readTokens(response, refresh);
    },
    async logout(accessToken) {
      await request({ path: logout, accessToken: accessToken ?? undefined });
    },
  };
}
