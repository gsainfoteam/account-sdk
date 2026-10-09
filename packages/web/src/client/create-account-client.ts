import {
  AccountError,
  AUTHORIZATION_HEADER,
  bearer,
  createAuthorization,
  discover,
  exchangeCode,
  isCallbackUrl,
  isUnauthorized,
  OFFLINE_ACCESS_SCOPE,
  parseCallback,
  readCallbackState,
  type Fetch,
  type Prompt,
  type Scope,
} from '@gsainfoteam/account-core';
import { Mutex } from 'es-toolkit';
import * as z from 'zod/mini';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from './account-state';
import { AccountClientOptionsSchema, type AccountClientOptions } from './options';
import { type LoginCredential } from '../session/session-adapter';
import { STORAGE_KEYS } from '../storage/keys';
import { saveTransaction, takeTransaction } from '../storage/transactions';

export interface LoginOptions {
  /** callback 뒤에 사용자를 보낼 위치. {@link AccountClient.handleCallback} 이 돌려준다. */
  returnTo?: string;
  prompt?: Prompt;
}

export interface CallbackResult {
  returnTo: string | undefined;
}

/** IdP 와 서비스 백엔드 세션을 다루는 브라우저 client. */
export interface AccountClient {
  readonly store: StoreApi<AccountState>;

  getAccessToken(): string | null;

  /**
   * {@link SessionAdapter.refresh} 로 세션을 복구한다. 여러 번 불러도 안전하다.
   *
   * @remarks
   * callback 페이지에서는 건너뛴다. 그곳에서는 {@link AccountClient.handleCallback} 이 세션을 만들고,
   * 동시에 refresh 하면 서로 경합하기 때문이다.
   */
  ready(): Promise<void>;

  /**
   * IdP 로그인 페이지로 보낸다.
   *
   * @remarks
   * 로그아웃해도 IdP 자체의 로그인 세션은 끝나지 않는다. 그래서 로그아웃 뒤 첫 로그인에는 `prompt=login` 을
   * 붙여 사용자가 계정을 바꿀 수 있게 한다.
   */
  login(options?: LoginOptions): Promise<void>;

  /**
   * callback 을 검증하고, code 를 교환하고, 서비스 백엔드에 로그인한다.
   *
   * @remarks
   * React StrictMode 는 effect 를 두 번 돌리는데 code 는 한 번만 교환할 수 있다. 그래서 같은 callback 에 대한
   * 호출은 시도 하나를 같이 쓴다.
   *
   * @throws {@link AccountError} `state_mismatch`, `user_cancelled`, `session_rejected` 등.
   */
  handleCallback(url?: string): Promise<CallbackResult>;

  /**
   * 같은 IdP 토큰에 body 를 더해 로그인을 다시 보낸다. 예를 들어 서비스가 첫 시도를 `session_rejected` 로
   * 거절하며 요구한 동의 내용을 보낼 때 쓴다.
   *
   * @remarks
   * `browser` 교환으로 한 로그인만 재시도할 수 있다. authorization code 는 한 번만 쓸 수 있기 때문이다.
   */
  retryLogin(body: unknown): Promise<void>;

  /** 서비스 세션을 끝낸다. 어차피 로컬에서는 로그아웃되므로 서버 쪽 실패는 조용히 넘긴다. */
  logout(): Promise<void>;

  /**
   * 서비스 백엔드에서 새 access token 을 받는다.
   *
   * @param staleToken 요청이 거절당했을 때 쓴 토큰. 다른 호출이 이미 교체했다면 다시 refresh 하지 않고
   * 그 새 토큰을 돌려준다.
   * @returns 새 토큰. refresh 할 세션이 없으면 `null`.
   */
  refresh(staleToken?: string | null): Promise<string | null>;

  /** access token 을 보내고, 401 이면 refresh 한 뒤 한 번 다시 시도하는 `fetch`. */
  fetch: Fetch;
}

/**
 * 브라우저 client 를 만든다.
 *
 * @example
 * ```ts
 * export const account = createAccountClient({
 *   issuer: 'production',
 *   clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID,
 *   redirectUri: '/auth/callback',
 *   scopes: ['name', 'email'],
 *   exchange: 'browser',
 *   session: cookieSession({ baseUrl: import.meta.env.VITE_API_URL }),
 * });
 * ```
 *
 * @throws {@link AccountError} 옵션이 없거나 비어 있으면 `invalid_request`.
 */
export function createAccountClient(input: AccountClientOptions): AccountClient {
  const parsed = AccountClientOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountClient options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const options = parsed.data;
  const { clientId, session, fetch } = options;
  const scopes: Scope[] = options.offlineAccess
    ? [...options.scopes, OFFLINE_ACCESS_SCOPE]
    : options.scopes;
  const transactions = options.transactionStorage ?? globalThis.sessionStorage;
  const redirect = options.redirect ?? ((url: string) => window.location.assign(url));

  const metadata = () => discover(options.issuer, { fetch });
  const redirectUri = (): string => new URL(options.redirectUri, window.location.origin).toString();

  const store = createStore<AccountState>(() => ({
    status: 'loading',
    accessToken: null,
    error: null,
    canRetryLogin: false,
  }));

  const refreshMutex = new Mutex();
  const callbacks = new Map<string, Promise<CallbackResult>>();
  let pendingCredential: LoginCredential | null = null;
  let initializing: Promise<void> | undefined;

  const authenticate = (accessToken: string): void => {
    pendingCredential = null;
    store.setState({
      status: 'authenticated',
      accessToken,
      error: null,
      canRetryLogin: false,
    });
  };

  const unauthenticate = (error: AccountError | null = null): void => {
    store.setState({
      status: 'unauthenticated',
      accessToken: null,
      error,
      canRetryLogin: pendingCredential !== null,
    });
  };

  const startSession = async (credential: LoginCredential, body?: unknown): Promise<void> => {
    try {
      const tokens = await session.start(credential, body);
      localStorage.removeItem(STORAGE_KEYS.loggedOut);
      authenticate(tokens.accessToken);
    } catch (error) {
      const accountError = toAccountError(error);
      const retryable =
        credential.type === 'idp_token' && AccountError.is(accountError, 'session_rejected');
      pendingCredential = retryable ? credential : null;
      unauthenticate(accountError);
      throw accountError;
    }
  };

  const credentialOf = async (
    url: string,
  ): Promise<{ credential: LoginCredential; returnTo?: string }> => {
    const transaction = takeTransaction(transactions, readCallbackState(url));
    const current = await metadata();
    const callback = parseCallback(current, url, { clientId, state: transaction?.state });
    if (!transaction) throw new AccountError('state_mismatch');

    const { codeVerifier, redirectUri, nonce, returnTo } = transaction;
    const { code, iss } = callback;

    if (options.exchange === 'backend') {
      return {
        credential: { type: 'code', code, codeVerifier, redirectUri, nonce, iss },
        returnTo,
      };
    }

    const tokens = await exchangeCode(
      current,
      { clientId },
      { code, codeVerifier, redirectUri, nonce, iss },
      { fetch },
    );
    const { accessToken, idToken, idTokenClaims } = tokens;
    return { credential: { type: 'idp_token', accessToken, idToken, idTokenClaims }, returnTo };
  };

  const client: AccountClient = {
    store,

    getAccessToken() {
      return store.getState().accessToken;
    },

    ready() {
      initializing ??= (async () => {
        const onCallbackPage =
          isCallbackUrl(window.location.href) &&
          window.location.pathname === new URL(redirectUri()).pathname;
        if (onCallbackPage) return;

        try {
          const tokens = await session.refresh();
          if (tokens) authenticate(tokens.accessToken);
          else unauthenticate();
        } catch (error) {
          unauthenticate(toAccountError(error));
        }
      })();

      return initializing;
    },

    async login({ returnTo, prompt } = {}) {
      const loggedOut = localStorage.getItem(STORAGE_KEYS.loggedOut) !== null;
      const { url, transaction } = await createAuthorization(await metadata(), {
        clientId,
        redirectUri: redirectUri(),
        scopes,
        prompt: prompt ?? (loggedOut ? 'login' : undefined),
      });

      saveTransaction(transactions, transaction, returnTo);
      redirect(url);
    },

    handleCallback(url = window.location.href) {
      const key = readCallbackState(url) ?? url;

      let pending = callbacks.get(key);
      if (!pending) {
        pending = (async () => {
          const { credential, returnTo } = await credentialOf(url);
          await startSession(credential);
          return { returnTo };
        })().catch((error: unknown) => {
          const accountError = toAccountError(error);
          if (store.getState().status !== 'unauthenticated') unauthenticate(accountError);
          throw accountError;
        });
        callbacks.set(key, pending);
      }

      return pending;
    },

    async retryLogin(body) {
      if (!pendingCredential) {
        throw new AccountError('unauthenticated', { description: 'no login to retry' });
      }

      await startSession(pendingCredential, body);
    },

    async logout() {
      const { accessToken } = store.getState();

      pendingCredential = null;
      localStorage.setItem(STORAGE_KEYS.loggedOut, '1');
      unauthenticate();

      await session.end(accessToken).catch(() => undefined);
    },

    async refresh(staleToken = store.getState().accessToken) {
      await refreshMutex.acquire();
      try {
        const { accessToken } = store.getState();
        if (accessToken && accessToken !== staleToken) return accessToken;

        const tokens = await session.refresh();
        if (!tokens) {
          unauthenticate();
          return null;
        }

        authenticate(tokens.accessToken);
        return tokens.accessToken;
      } catch (error) {
        unauthenticate(toAccountError(error));
        return null;
      } finally {
        refreshMutex.release();
      }
    },

    async fetch(input, init) {
      await client.ready();

      const send = (token: string | null): Promise<Response> => {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        if (token) headers.set(AUTHORIZATION_HEADER, bearer(token));

        const request = input instanceof Request ? input.clone() : input;
        return (fetch ?? globalThis.fetch)(request, { ...init, headers });
      };

      const token = client.getAccessToken();
      const response = await send(token);
      if (!isUnauthorized(response.status)) return response;

      const refreshed = await client.refresh(token);
      return refreshed ? send(refreshed) : response;
    },
  };

  return client;
}

function toAccountError(error: unknown): AccountError {
  return AccountError.is(error) ? error : new AccountError('unknown', { cause: error });
}
