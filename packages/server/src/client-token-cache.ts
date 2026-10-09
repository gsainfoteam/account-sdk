import { CLIENT_TOKEN_REFRESH_MARGIN_MS, type TokenResponse } from '@gsainfoteam/account-core';
import { Mutex } from 'es-toolkit';

export interface ClientTokenCache {
  get(): Promise<string>;
  invalidate(): void;
}

export function createClientTokenCache(request: () => Promise<TokenResponse>): ClientTokenCache {
  let token: { value: string; expiresAt: number } | undefined;
  const mutex = new Mutex();

  return {
    async get() {
      await mutex.acquire();
      try {
        if (token && token.expiresAt - CLIENT_TOKEN_REFRESH_MARGIN_MS > Date.now())
          return token.value;
        const tokens = await request();
        token = {
          value: tokens.accessToken,
          expiresAt: Date.now() + (tokens.expiresIn ?? 0) * 1000,
        };
        return token.value;
      } finally {
        mutex.release();
      }
    },
    invalidate() {
      token = undefined;
    },
  };
}
