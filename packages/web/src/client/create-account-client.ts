import {
  AccountError,
  AUTHORIZATION_HEADER,
  bearer,
  isUnauthorized,
  createAuthorization,
  discover,
  exchangeCode,
  isCallbackUrl,
  parseCallback,
  readCallbackState,
  type Fetch,
  type Prompt,
} from '@gsainfoteam/account-core';
import { Mutex } from 'es-toolkit';
import * as z from 'zod/mini';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from './account-state';
import { AccountClientOptionsSchema, type AccountClientOptions } from './options';
import { type LoginCredential } from '../session/session-adapter';
import { STORAGE_KEYS } from '../storage/keys';
import { saveTransaction, takeTransaction } from '../storage/transactions';

export interface SignInOptions {
  returnTo?: string;
  prompt?: Prompt;
}

export interface CallbackResult {
  returnTo: string | undefined;
}

export interface AccountClient {
  readonly store: StoreApi<AccountState>;
  ready(): Promise<void>;
  signIn(options?: SignInOptions): Promise<void>;
  handleCallback(url?: string): Promise<CallbackResult>;
  retryLogin(body: unknown): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): string | null;
  refresh(staleToken?: string | null): Promise<string | null>;
  fetch: Fetch;
}

const SIGNED_OUT_KEY = STORAGE_KEYS.signedOut;

export function createAccountClient(input: AccountClientOptions): AccountClient {
  const parsed = AccountClientOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountClient options: ${z.prettifyError(parsed.error)}`,
    });
  }
  const options = parsed.data;
  const { clientId, session, fetch } = options;
  const transactions = options.transactionStorage ?? globalThis.sessionStorage;
  const redirect = options.redirect ?? ((url: string) => window.location.assign(url));
  const scopes = options.offlineAccess
    ? [...options.scopes, 'offline_access' as const]
    : options.scopes;
  const redirectUri = (): string => new URL(options.redirectUri, window.location.origin).toString();
  const metadata = () => discover(options.issuer, { fetch });

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
    store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
  };
  const unauthenticate = (error: AccountError | null = null): void => {
    store.setState({
      status: 'unauthenticated',
      accessToken: null,
      error,
      canRetryLogin: pendingCredential !== null,
    });
  };

  const login = async (credential: LoginCredential, body?: unknown): Promise<void> => {
    try {
      const tokens = await session.login(credential, body);
      localStorage.removeItem(SIGNED_OUT_KEY);
      authenticate(tokens.accessToken);
    } catch (error) {
      const accountError = toAccountError(error);
      // 같은 IdP 토큰으로 다시 보낼 수 있을 때만 남긴다. code 는 한 번 쓰면 끝이라 재시도할 수 없다.
      pendingCredential =
        credential.type === 'idp_token' && AccountError.is(accountError, 'session_rejected')
          ? credential
          : null;
      unauthenticate(accountError);
      throw accountError;
    }
  };

  const completeCallback = async (url: string): Promise<CallbackResult> => {
    const transaction = takeTransaction(transactions, readCallbackState(url));
    const current = await metadata();
    const callback = parseCallback(current, url, { clientId, state: transaction?.state });
    if (!transaction) throw new AccountError('state_mismatch');

    if (options.exchange === 'browser') {
      const tokens = await exchangeCode(
        current,
        { clientId },
        {
          code: callback.code,
          codeVerifier: transaction.codeVerifier,
          redirectUri: transaction.redirectUri,
          nonce: transaction.nonce,
          iss: callback.iss,
        },
        { fetch },
      );
      await login({
        type: 'idp_token',
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        idTokenClaims: tokens.idTokenClaims,
      });
    } else {
      await login({
        type: 'code',
        code: callback.code,
        codeVerifier: transaction.codeVerifier,
        redirectUri: transaction.redirectUri,
        nonce: transaction.nonce,
        iss: callback.iss,
      });
    }
    return { returnTo: transaction.returnTo };
  };

  const client: AccountClient = {
    store,

    ready() {
      initializing ??= (async () => {
        // callback 페이지에서는 AccountCallback 이 세션을 만든다. 여기서 refresh 를 하면 그 결과와 경합한다.
        if (
          isCallbackUrl(window.location.href) &&
          window.location.pathname === new URL(redirectUri()).pathname
        ) {
          return;
        }
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

    async signIn({ returnTo, prompt } = {}) {
      const current = await metadata();
      // 로그아웃해도 IdP 로그인 세션은 남는다. 다른 계정으로 바꿀 수 있게 로그아웃 직후 한 번은 로그인 화면을 띄운다.
      const signedOut = localStorage.getItem(SIGNED_OUT_KEY) !== null;
      const { url, transaction } = await createAuthorization(current, {
        clientId,
        redirectUri: redirectUri(),
        scopes,
        prompt: prompt ?? (signedOut ? 'login' : undefined),
      });
      saveTransaction(transactions, transaction, returnTo);
      redirect(url);
    },

    handleCallback(url = window.location.href) {
      // React StrictMode 는 effect 를 두 번 실행한다. 같은 callback 을 두 번 교환하면 두 번째는 invalid_grant 다.
      const key = readCallbackState(url) ?? url;
      let pending = callbacks.get(key);
      if (!pending) {
        pending = completeCallback(url).catch((error: unknown) => {
          const accountError = toAccountError(error);
          if (store.getState().status !== 'unauthenticated') unauthenticate(accountError);
          throw accountError;
        });
        callbacks.set(key, pending);
      }
      return pending;
    },

    async retryLogin(body) {
      if (!pendingCredential)
        throw new AccountError('unauthenticated', { description: 'no login to retry' });
      await login(pendingCredential, body);
    },

    async signOut() {
      const { accessToken } = store.getState();
      pendingCredential = null;
      localStorage.setItem(SIGNED_OUT_KEY, '1');
      unauthenticate();
      await session.logout(accessToken).catch(() => undefined);
    },

    getAccessToken() {
      return store.getState().accessToken;
    },

    async refresh(staleToken = store.getState().accessToken) {
      await refreshMutex.acquire();
      try {
        const { accessToken } = store.getState();
        // 기다리는 동안 다른 요청이 이미 갱신했다면 그 토큰을 쓴다.
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
