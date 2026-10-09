import { AccountError, isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths } from './session-adapter';

export interface CookieSessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
}

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
