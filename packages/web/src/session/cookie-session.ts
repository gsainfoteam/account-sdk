import { AccountError, isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths } from './session-adapter';

export interface CookieSessionOptions {
  /** 서비스 API 의 origin 이나 기본 경로. `/api` 같은 상대 경로는 dev proxy 와 함께 쓸 수 있다. */
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
}

/**
 * IdP 토큰을 bearer 토큰으로 받아 로그인하고, refresh token 을 httpOnly 쿠키에 두는 백엔드용 세션.
 * ziggle-be 와 house-moving-out-be 가 이 방식이다.
 *
 * `POST {login}` 은 `Authorization: Bearer <IdP 토큰>` 과 함께, `POST {refresh}` 는 쿠키와 함께,
 * `POST {logout}` 은 서비스 토큰과 함께 보낸다. 모든 요청에 credentials 를 싣는다. 응답에는 `access_token` 이 있어야 한다.
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
    async start(credential, body) {
      if (credential.type !== 'idp_token') {
        throw new AccountError('invalid_request', {
          description: "cookieSession needs exchange: 'browser'",
        });
      }

      const response = await request({ path: login, accessToken: credential.accessToken, body });

      return readTokens(response, login);
    },

    async refresh() {
      const response = await request({ path: refresh });
      if (isAuthFailure(response.status)) return null;

      return readTokens(response, refresh);
    },

    async end(accessToken) {
      await request({ path: logout, accessToken: accessToken ?? undefined });
    },
  };
}
