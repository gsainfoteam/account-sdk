import { CLIENT_TOKEN_REFRESH_MARGIN_MS, type TokenResponse } from '@gsainfoteam/account-core';
import { Mutex } from 'es-toolkit';

export interface ClientTokenCache {
  get(): Promise<string>;
  invalidate(): void;
}

export function createClientTokenCache(request: () => Promise<TokenResponse>): ClientTokenCache {
  const mutex = new Mutex();
  let token: CachedToken | undefined;

  return {
    async get() {
      await mutex.acquire();
      try {
        if (isFresh(token)) return token.value;

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

interface CachedToken {
  value: string;
  expiresAt: number;
}

function isFresh(token: CachedToken | undefined): token is CachedToken {
  return token !== undefined && token.expiresAt - CLIENT_TOKEN_REFRESH_MARGIN_MS > Date.now();
}
