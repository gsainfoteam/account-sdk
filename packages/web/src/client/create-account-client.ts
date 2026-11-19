import { AccountError } from '@infoteam/account-core';
import * as z from 'zod/mini';

import { createContext } from './context';
import { AccountClientOptionsSchema, type AccountClientOptions } from './options';
import { createServerClient } from './server-client';
import { type AccountClient } from './types';
import { authorizedFetch } from '../fetch/authorized-fetch';
import { apiOrigin } from '../internal/urls';
import { login } from '../login/authorize';
import { finishCallback } from '../login/callback';
import { retryLogin } from '../login/retry-login';
import { logout } from '../logout/logout';
import { refreshSession, restoreSession } from '../refresh/refresh-session';

/** 페이지가 callback으로 열렸으면 만드는 즉시 주소를 바꾸므로, 주소를 읽는 라우터보다 먼저 만들어야 한다. */
export function createAccountClient(input: AccountClientOptions): AccountClient {
  const parsed = AccountClientOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountClient options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const options = parsed.data;
  if (typeof window === 'undefined') return createServerClient(options.fetch);

  const context = createContext(options);
  const { store } = context.account;
  const { callback } = context;
  let initializing: Promise<void> | undefined;
  let settled = false;

  const client: AccountClient = {
    store,

    getAccessToken() {
      return store.getState().accessToken;
    },

    ready() {
      initializing ??= (
        callback ? finishCallback(context, callback) : restoreSession(context)
      ).finally(() => {
        settled = true;
      });

      return initializing;
    },

    isHandlingRedirect() {
      return !settled && (callback !== null || context.trySilentLogin);
    },

    async requireAuth({ returnTo } = {}) {
      await client.ready();
      if (store.getState().status === 'authenticated') return;
      // 다시 IdP로 보내면 취소한 사용자가 IdP 화면에서 빠져나갈 수 없다.
      if (context.account.callbackError) throw context.account.callbackError;

      await client.login({ returnTo });
      return new Promise<never>(() => undefined);
    },

    login: (loginOptions) => login(context, loginOptions),
    retryLogin: (body) => retryLogin(context, body),
    logout: (logoutOptions) => logout(context, logoutOptions),
    refresh: (staleToken = store.getState().accessToken) => refreshSession(context, staleToken),

    fetch: authorizedFetch({
      tokenOrigins: new Set(
        [apiOrigin(options.api), ...(options.tokenOrigins ?? [])].map(
          (origin) => new URL(origin, window.document.baseURI).origin,
        ),
      ),
      fetch: options.fetch,
      ready: () => client.ready(),
      getAccessToken: () => client.getAccessToken(),
      refresh: (staleToken) => client.refresh(staleToken),
    }),
  };

  return client;
}
