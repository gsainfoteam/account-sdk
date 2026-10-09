import {
  AccountError,
  AUTHORIZATION_HEADER,
  bearer,
  createAuthorization,
  discover,
  exchangeCode,
  isCallbackUrl,
  isUnauthorized,
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
  /** Where to send the user after the callback. Handed back by {@link AccountClient.handleCallback}. */
  returnTo?: string;
  prompt?: Prompt;
}

export interface CallbackResult {
  returnTo: string | undefined;
}

/** Browser client for the IdP and the service backend's session. */
export interface AccountClient {
  readonly store: StoreApi<AccountState>;

  getAccessToken(): string | null;

  /**
   * Restores the session through {@link SessionAdapter.refresh}. Safe to call more than once.
   *
   * @remarks
   * Skipped on the callback page, where {@link AccountClient.handleCallback} creates the session and a
   * concurrent refresh would race it.
   */
  ready(): Promise<void>;

  /**
   * Redirects to the IdP login page.
   *
   * @remarks
   * Signing out does not end the IdP's own login session. The first sign-in after a sign-out therefore
   * asks for `prompt=login`, so the user can switch accounts.
   */
  signIn(options?: SignInOptions): Promise<void>;

  /**
   * Validates the callback, exchanges the code and logs in to the service backend.
   *
   * @remarks
   * React StrictMode runs effects twice, and a code can be exchanged only once. Calls for the same
   * callback share one attempt.
   *
   * @throws {@link AccountError} such as `state_mismatch`, `user_cancelled` or `session_rejected`.
   */
  handleCallback(url?: string): Promise<CallbackResult>;

  /**
   * Sends the login again with the same IdP token and an extra body, for example the consent a service
   * asked for after rejecting the first attempt with `session_rejected`.
   *
   * @remarks
   * Only logins made with the `browser` exchange can be retried; an authorization code works once.
   */
  retryLogin(body: unknown): Promise<void>;

  /** Ends the service session. Fails silently on the server side because the user is signed out locally either way. */
  signOut(): Promise<void>;

  /**
   * Gets a new access token from the service backend.
   *
   * @param staleToken The token a request was rejected with. If another caller already replaced it,
   * that newer token is returned without refreshing again.
   * @returns The new token, or `null` when there is no session to refresh.
   */
  refresh(staleToken?: string | null): Promise<string | null>;

  /** `fetch` that sends the access token and retries once after refreshing on 401. */
  fetch: Fetch;
}

/**
 * Creates the browser client.
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
 * @throws {@link AccountError} `invalid_request` when an option is missing or empty.
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
  const scopes = options.offlineAccess
    ? [...options.scopes, 'offline_access' as const]
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

  const login = async (credential: LoginCredential, body?: unknown): Promise<void> => {
    try {
      const tokens = await session.login(credential, body);
      localStorage.removeItem(STORAGE_KEYS.signedOut);
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

    async signIn({ returnTo, prompt } = {}) {
      const signedOut = localStorage.getItem(STORAGE_KEYS.signedOut) !== null;
      const { url, transaction } = await createAuthorization(await metadata(), {
        clientId,
        redirectUri: redirectUri(),
        scopes,
        prompt: prompt ?? (signedOut ? 'login' : undefined),
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
          await login(credential);
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

      await login(pendingCredential, body);
    },

    async signOut() {
      const { accessToken } = store.getState();

      pendingCredential = null;
      localStorage.setItem(STORAGE_KEYS.signedOut, '1');
      unauthenticate();

      await session.logout(accessToken).catch(() => undefined);
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
