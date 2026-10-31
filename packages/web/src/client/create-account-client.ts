import {
  AccountError,
  AUTHORIZATION_HEADER,
  bearer,
  CALLBACK_PATH,
  createAuthorization,
  createLogoutUrl,
  discover,
  fetchClientRegistration,
  isCallbackUrl,
  isUnauthorized,
  OPENID_SCOPE,
  parseCallback,
  readCallbackState,
  type ClientScope,
  type Fetch,
  type Prompt,
  type OAuthErrorCode,
} from '@gsainfoteam/account-core';
import { attempt, isString, Mutex } from 'es-toolkit';
import * as z from 'zod/mini';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from './account-state';
import { AccountClientOptionsSchema, type AccountClientOptions } from './options';
import { apiSession } from '../session/api-session';
import { type LoginCredential, type SessionRejection } from '../session/session-adapter';
import { STORAGE_KEYS } from '../storage/keys';
import { saveTransaction, takeTransaction, type StoredTransaction } from '../storage/transactions';

export interface LoginOptions {
  /** 다른 origin을 가리키면 버린다. */
  returnTo?: string;
  prompt?: Prompt;
}

export interface LogoutOptions {
  /** IdP 로그인 세션도 끝낸다. 공용 PC처럼 다음 사람이 같은 IdP 계정으로 자동 로그인되면 안 될 때 쓴다. */
  idp?: boolean;
  /** `idp: true`일 때만 쓴다. 같은 origin이어야 한다. */
  returnTo?: string;
}

export interface RequireAuthOptions {
  /**
   * 생략하면 현재 페이지를 쓰는데, 라우터 guard에서는 현재 페이지가 아직 이전 페이지다. 이동하려는 대상을 넘긴다.
   * TanStack Router에서는 `location.href`, React Router에서는 `request.url`이 그 대상이다.
   */
  returnTo?: string;
}

export interface AccountClient {
  readonly store: StoreApi<AccountState>;

  getAccessToken(): string | null;

  /** 여러 번 불러도 초기화는 한 번만 한다. 실패해도 에러를 던지지 않고 `store`의 `error`에 남긴다. */
  ready(): Promise<void>;

  /** callback을 처리하거나 자동 로그인을 시도하는 중인지 알려 준다. 곧 떠날 화면이 깜빡이지 않게 가릴 때 쓴다. */
  isHandlingRedirect(): boolean;

  /**
   * 세션이 없으면 사용자를 IdP로 보내고 끝나지 않는 Promise를 돌려줘서, 라우터가 이동 중 화면을 유지하게 한다.
   *
   * @throws {@link AccountError} 이 페이지의 callback이 실패했으면 그 에러를 던진다. 다시 IdP로 보내면 취소한 사용자가
   * 빠져나갈 수 없게 되므로, 라우터의 에러 화면에서 `error.code`로 경우를 나눈다.
   */
  requireAuth(options?: RequireAuthOptions): Promise<void>;

  /**
   * `logout({ idp: false })`는 IdP 로그인 세션을 남기므로, 로그아웃 뒤 첫 로그인에는 `prompt=login`을 붙여
   * 사용자가 계정을 바꿀 수 있게 한다.
   */
  login(options?: LoginOptions): Promise<void>;

  /**
   * `session_rejected`로 거절된 로그인을 body를 더해 다시 보낸다. 거절 응답의 ticket을 쓰므로 IdP를 다시
   * 거치지 않는다.
   */
  retryLogin(body: unknown): Promise<void>;

  /**
   * 어차피 로컬에서는 로그아웃되므로 서버 쪽 실패는 조용히 넘긴다. IdP가 로그아웃을 지원하지 않으면 `idp: true`여도
   * 서비스 세션만 끝낸다.
   */
  logout(options?: LogoutOptions): Promise<void>;

  /** `staleToken`을 다른 호출이 이미 교체했다면 다시 refresh 하지 않고 그 새 토큰을 돌려준다. */
  refresh(staleToken?: string | null): Promise<string | null>;

  /** access token을 보내고, 401이면 refresh 한 뒤 한 번 다시 시도하는 `fetch`다. */
  fetch: Fetch;
}

/**
 * client를 라우터보다 먼저 만들어야 한다. 페이지가 callback으로 열렸으면 만드는 즉시 주소를 로그인 전 위치로 바꾸는데,
 * 라우터는 만들어질 때 주소를 읽기 때문이다.
 *
 * @throws {@link AccountError} 옵션이 없거나 비어 있으면 `invalid_request`를 던진다.
 */
export function createAccountClient(input: AccountClientOptions): AccountClient {
  const parsed = AccountClientOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountClient options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const options = parsed.data;
  const { clientId, fetch } = options;
  const { baseUrl, paths = {} } = isString(options.api) ? { baseUrl: options.api } : options.api;
  const session = apiSession(baseUrl, paths, fetch);
  const transactions = options.transactionStorage ?? globalThis.sessionStorage;
  const redirect = options.redirect ?? ((url: string) => window.location.assign(url));

  const metadata = () => discover(options.issuer, { fetch });
  const redirectUri = (): string =>
    new URL(options.redirectUri ?? CALLBACK_PATH, window.location.origin).toString();

  let registeredScopes: Promise<ClientScope[]> | undefined;
  const scopes = async (): Promise<ClientScope[]> => {
    if (options.scopes) return options.scopes;

    registeredScopes ??= metadata()
      .then((current) => fetchClientRegistration(current, clientId, { fetch }))
      .then(({ scopes: required, optionalScopes }) => [...required, ...optionalScopes]);

    return registeredScopes.catch((error: unknown) => {
      registeredScopes = undefined;
      throw error;
    });
  };

  const store = createStore<AccountState>(() => ({
    status: 'loading',
    accessToken: null,
    error: null,
    canRetryLogin: false,
  }));

  const refreshMutex = new Mutex();
  const callback = takeCallback(redirectUri(), transactions);
  const trySilentLogin =
    options.silentLogin === true &&
    callback === null &&
    transactions.getItem(STORAGE_KEYS.silentLoginTried) === null &&
    localStorage.getItem(STORAGE_KEYS.loggedOut) === null;
  let callbackError: AccountError | null = null;
  let rejection: SessionRejection | null = null;
  let initializing: Promise<void> | undefined;
  let settled = false;

  const authenticate = (accessToken: string): void => {
    rejection = null;
    callbackError = null;
    store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
  };

  const unauthenticate = (error: AccountError | null = null): void => {
    store.setState({
      status: 'unauthenticated',
      accessToken: null,
      error,
      canRetryLogin: rejection?.ticket !== undefined,
    });
  };

  const startSession = async (credential: LoginCredential, body?: unknown): Promise<void> => {
    const result = await session.start(credential, body);

    if ('rejected' in result) {
      rejection = result.rejected;
      throw result.rejected.error;
    }

    localStorage.removeItem(STORAGE_KEYS.loggedOut);
    authenticate(result.tokens.accessToken);
  };

  const finishCallback = async ({ url, transaction }: Callback): Promise<void> => {
    try {
      const params = parseCallback(await metadata(), url, { clientId, state: transaction?.state });
      if (!transaction) throw new AccountError('state_mismatch');

      const { codeVerifier, redirectUri: sentRedirectUri, nonce } = transaction;
      await startSession({
        code: params.code,
        codeVerifier,
        redirectUri: sentRedirectUri,
        nonce,
        iss: params.iss,
      });
    } catch (error) {
      const accountError = toAccountError(error);
      if (transaction?.silent && SILENT_LOGIN_FAILURES.has(accountError.code)) {
        unauthenticate();
        return;
      }

      callbackError = accountError;
      unauthenticate(callbackError);
    }
  };

  const authorize = async (
    returnTo: string,
    prompt: Prompt | undefined,
    silent: boolean,
  ): Promise<void> => {
    const loggedOut = localStorage.getItem(STORAGE_KEYS.loggedOut) !== null;
    const { url, transaction } = await createAuthorization(await metadata(), {
      clientId,
      redirectUri: redirectUri(),
      scopes: [OPENID_SCOPE, ...(await scopes())],
      prompt: prompt ?? (loggedOut ? 'login' : undefined),
    });

    saveTransaction(transactions, transaction, { returnTo: sameOriginPath(returnTo), silent });
    redirect(url);
  };

  const restoreSession = async (): Promise<void> => {
    try {
      const tokens = await session.refresh();
      if (tokens) return authenticate(tokens.accessToken);

      if (trySilentLogin) {
        transactions.setItem(STORAGE_KEYS.silentLoginTried, '1');
        await authorize(window.location.href, 'none', true);
        return new Promise<never>(() => undefined);
      }

      unauthenticate();
    } catch (error) {
      unauthenticate(toAccountError(error));
    }
  };

  const client: AccountClient = {
    store,

    getAccessToken() {
      return store.getState().accessToken;
    },

    ready() {
      initializing ??= (callback ? finishCallback(callback) : restoreSession()).finally(() => {
        settled = true;
      });

      return initializing;
    },

    isHandlingRedirect() {
      return !settled && (callback !== null || trySilentLogin);
    },

    async requireAuth({ returnTo } = {}) {
      await client.ready();
      if (store.getState().status === 'authenticated') return;
      if (callbackError) throw callbackError;

      await client.login({ returnTo });
      return new Promise<never>(() => undefined);
    },

    async login({ returnTo = window.location.href, prompt } = {}) {
      await authorize(returnTo, prompt, false);
    },

    async retryLogin(body) {
      if (rejection?.ticket === undefined) {
        throw new AccountError('unauthenticated', { description: 'no login to retry' });
      }

      try {
        await startSession({ ticket: rejection.ticket }, body);
      } catch (error) {
        unauthenticate(toAccountError(error));
        throw error;
      }
    },

    async logout({ idp = false, returnTo = '/' } = {}) {
      const { accessToken } = store.getState();

      rejection = null;
      localStorage.setItem(STORAGE_KEYS.loggedOut, '1');
      unauthenticate();

      await session.end(accessToken).catch(() => undefined);
      if (!idp) return;

      const logout = createLogoutUrl(await metadata(), {
        clientId,
        postLogoutRedirectUri: redirectUri(),
      });
      if (!logout) return;

      transactions.setItem(
        STORAGE_KEYS.logoutPrefix + logout.state,
        sameOriginPath(returnTo) ?? '/',
      );
      redirect(logout.url);
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

/** 사용자가 직접 로그인하면 되는 자동 로그인 실패 코드다. 에러로 알리지 않는다. */
const SILENT_LOGIN_FAILURES = new Set<string>([
  'login_required',
  'consent_required',
  'interaction_required',
] satisfies OAuthErrorCode[]);

interface Callback {
  url: string;
  transaction: StoredTransaction | null;
}

/**
 * 동기로 처리해야 한다. 라우터가 만들어지기 전에 주소가 바뀌어 있어야 라우터가 callback 주소를 라우팅하지 않는다.
 * 같은 이유로 돌아갈 위치가 든 트랜잭션도 미리 꺼낸다.
 */
function takeCallback(redirectUri: string, transactions: Storage): Callback | null {
  const url = window.location.href;
  if (new URL(url).pathname !== new URL(redirectUri).pathname) return null;

  const logoutKey = STORAGE_KEYS.logoutPrefix + readCallbackState(url);
  const afterLogout = transactions.getItem(logoutKey);
  if (afterLogout !== null && !isCallbackUrl(url)) {
    transactions.removeItem(logoutKey);
    window.history.replaceState(null, '', afterLogout);
    return null;
  }

  if (!isCallbackUrl(url)) return null;

  const transaction = takeTransaction(transactions, readCallbackState(url));
  window.history.replaceState(null, '', transaction?.returnTo ?? '/');

  return { url, transaction };
}

/** 로그인 뒤 사용자를 다른 사이트로 보내지 않도록 다른 origin은 버린다. */
function sameOriginPath(value: string): string | undefined {
  const [, url] = attempt(() => new URL(value, window.location.origin));
  if (url?.origin !== window.location.origin) return undefined;

  return url.pathname + url.search + url.hash;
}

function toAccountError(error: unknown): AccountError {
  return AccountError.is(error) ? error : new AccountError('unknown', { cause: error });
}
