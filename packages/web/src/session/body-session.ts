import { isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';
import { isPlainObject } from 'es-toolkit';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths, type SessionTokens } from './session-adapter';
import { STORAGE_KEYS } from '../storage/keys';

export interface BodySessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
  /** refresh token 을 보관할 곳. 기본은 `localStorage`. */
  storage?: Storage;
  storageKey?: string;
}

/**
 * refresh token 을 body 로 주고 body 로 돌려받는 백엔드용 세션. chatbot 백엔드가 이 방식이다.
 * API origin 과 쿠키를 공유할 수 없을 때 쓴다.
 *
 * 로그인은 `backend` 교환이면 `{ code, code_verifier, redirect_uri }` 를, `browser` 교환이면 IdP 토큰을
 * bearer 토큰으로 보낸다. refresh 와 로그아웃은 `{ refresh_token }` 을 보낸다.
 */
export function bodySession({
  baseUrl,
  paths = {},
  fetch,
  storage = globalThis.localStorage,
  storageKey = STORAGE_KEYS.refreshToken,
}: BodySessionOptions): SessionAdapter {
  const request = createRequester(baseUrl, fetch);
  const { login, refresh, logout } = { ...SESSION_PATHS, ...paths };

  const keep = (tokens: SessionTokens): SessionTokens => {
    if (tokens.refreshToken) storage.setItem(storageKey, tokens.refreshToken);
    return tokens;
  };

  return {
    async start(credential, body) {
      const extra = isPlainObject(body) ? body : {};

      const response =
        credential.type === 'code'
          ? await request({
              path: login,
              body: {
                code: credential.code,
                code_verifier: credential.codeVerifier,
                redirect_uri: credential.redirectUri,
                nonce: credential.nonce,
                iss: credential.iss,
                ...extra,
              },
            })
          : await request({ path: login, accessToken: credential.accessToken, body });

      return keep(await readTokens(response, login));
    },

    async refresh() {
      const refreshToken = storage.getItem(storageKey);
      if (!refreshToken) return null;

      const response = await request({ path: refresh, body: { refresh_token: refreshToken } });
      if (isAuthFailure(response.status)) {
        storage.removeItem(storageKey);
        return null;
      }

      return keep(await readTokens(response, refresh));
    },

    async end(accessToken) {
      const refreshToken = storage.getItem(storageKey);
      storage.removeItem(storageKey);

      await request({
        path: logout,
        accessToken: accessToken ?? undefined,
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      });
    },
  };
}
