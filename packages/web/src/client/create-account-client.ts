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

/**
 * **라우터를 만들기 전에, 모듈 최상단에서 한 번 호출한다.** 페이지가 callback으로 열렸으면 호출하는 즉시 주소에서 code를
 * 지우고 주소를 로그인 전 위치로 바꾼다. 라우터가 먼저 주소를 읽으면 callback 주소를 없는 라우트로 보고, 에러 없이 404
 * 화면이나 다른 페이지를 그린다.
 *
 * `RetryBody`는 `retryLogin(body)`에 넘길 body의 타입이다. 생략하면 `unknown`이다.
 */
export function createAccountClient<RetryBody = unknown>(
  input: AccountClientOptions,
): AccountClient<RetryBody> {
  const parsed = AccountClientOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountClient options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const options = parsed.data;
  if (typeof window === 'undefined') return createServerClient<RetryBody>(options.fetch);

  const context = createContext(options);
  const { store } = context.account;
  const { callback } = context;
  let initializing: Promise<void> | undefined;

  const client: AccountClient<RetryBody> = {
    store,

    getAccessToken() {
      return store.getState().accessToken;
    },

    ready() {
      initializing ??= (
        callback ? finishCallback(context, callback) : restoreSession(context)
      ).finally(() => context.account.settleRedirect());

      return initializing;
    },

    isHandlingRedirect() {
      return store.getState().redirecting;
    },

    async requireAuth({ returnTo } = {}) {
      await client.ready();
      if (store.getState().status === 'authenticated') return;
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
