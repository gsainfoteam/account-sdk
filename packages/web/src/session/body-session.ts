import { isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';
import { isPlainObject } from 'es-toolkit';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths, type SessionTokens } from './session-adapter';
import { STORAGE_KEYS } from '../storage/keys';

export interface BodySessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
  /** Where the refresh token is kept. Defaults to `localStorage`. */
  storage?: Storage;
  storageKey?: string;
}

/**
 * Session for backends that return the refresh token in the body and take it back in the body,
 * such as the chatbot backend. Use it when cookies cannot be shared with the API origin.
 *
 * Login sends `{ code, code_verifier, redirect_uri }` for the `backend` exchange, or the IdP token as a
 * bearer token for the `browser` exchange. Refresh and logout send `{ refresh_token }`.
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
    async login(credential, body) {
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

    async logout(accessToken) {
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
