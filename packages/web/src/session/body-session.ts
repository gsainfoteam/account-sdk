import { type Fetch } from '@gsainfoteam/account-core';

import { createRequester, readTokens } from './request';
import { type SessionAdapter, type SessionPaths, type SessionTokens } from './session-adapter';

export interface BodySessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
  storage?: Storage;
  storageKey?: string;
}

export function bodySession({
  baseUrl,
  paths = {},
  fetch,
  storage = globalThis.localStorage,
  storageKey = 'gsainfoteam-account:refresh-token',
}: BodySessionOptions): SessionAdapter {
  const request = createRequester(baseUrl, fetch);
  const { login = '/auth/login', refresh = '/auth/refresh', logout = '/auth/logout' } = paths;

  const keep = (tokens: SessionTokens): SessionTokens => {
    if (tokens.refreshToken) storage.setItem(storageKey, tokens.refreshToken);
    return tokens;
  };

  return {
    async login(credential, body) {
      const response =
        credential.type === 'code'
          ? await request({
              path: login,
              body: {
                code: credential.code,
                code_verifier: credential.codeVerifier,
                redirect_uri: credential.redirectUri,
                ...(credential.nonce ? { nonce: credential.nonce } : {}),
                ...(credential.iss ? { iss: credential.iss } : {}),
                ...(body as object | undefined),
              },
            })
          : await request({ path: login, accessToken: credential.accessToken, body });
      return keep(await readTokens(response, login));
    },
    async refresh() {
      const refreshToken = storage.getItem(storageKey);
      if (!refreshToken) return null;
      const response = await request({ path: refresh, body: { refresh_token: refreshToken } });
      if (response.status === 401 || response.status === 403) {
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
