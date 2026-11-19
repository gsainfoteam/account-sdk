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
} from '@infoteam/account-core';
import { attempt, isString, Mutex, trimEnd } from 'es-toolkit';
import * as z from 'zod/mini';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from './account-state';
import { AccountClientOptionsSchema, type AccountClientOptions, type Redirect } from './options';
import { createServerClient } from './server-client';
import { apiSession } from '../session/api-session';
import {
  type LoginCredential,
  type Session,
  type SessionRejection,
} from '../session/session-adapter';
import { browserStorage, isMemoryStorage } from '../storage/browser-storage';
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
   * 사용자가 계정을 바꿀 수 있게 한다. IdP로 보내기 전에 실패하면 그 에러를 `store`의 `error`에도 남긴다.
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

  /** `tokenOrigins`로 가는 요청에 access token을 보내고, 401이면 refresh 한 뒤 한 번 다시 시도하는 `fetch`다. */
  fetch: Fetch;
}

/**
 * client를 라우터보다 먼저 만들어야 한다. 페이지가 callback으로 열렸으면 만드는 즉시 주소를 로그인 전 위치로 바꾸는데,
 * 라우터는 만들어질 때 주소를 읽기 때문이다. 서버에서 만들면 세션이 없는 client를 돌려주므로, SSR 하는 앱도 모듈
 * 최상단에서 만들 수 있다.
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
  if (typeof window === 'undefined') return createServerClient(options.fetch);

  const { clientId, fetch } = options;
  const session = options.session ?? sessionFromApi(options.api!, fetch);
  const transactions = options.transactionStorage ?? browserStorage('sessionStorage');
  const flags = browserStorage('localStorage');
  // storage가 막히면 IdP에 다녀오는 동안 로그인 진행 정보를 잃어서, 돌아와도 `state_mismatch`로 끝난다.
  const canRoundTrip = !isMemoryStorage(transactions);
  const redirect: Redirect =
    options.redirect ??
    ((url, { replace = false } = {}) =>
      replace ? window.location.replace(url) : window.location.assign(url));
  const navigation = options.callbackNavigation ?? 'history';
  const tokenOrigins = new Set(
    [apiOrigin(options.api), ...(options.tokenOrigins ?? [])].map(
      (origin) => new URL(origin, window.location.href).origin,
    ),
  );

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
  const oneAtATime = async <T>(task: () => Promise<T>): Promise<T> => {
    await refreshMutex.acquire();
    try {
      return await task();
    } finally {
      refreshMutex.release();
    }
  };

  const callback = takeCallback({ redirectUri: redirectUri(), transactions, navigation, redirect });
  const trySilentLogin =
    options.silentLogin === true &&
    canRoundTrip &&
    callback === null &&
    transactions.getItem(STORAGE_KEYS.silentLoginTried) === null &&
    flags.getItem(STORAGE_KEYS.loggedOut) === null;
  let callbackError: AccountError | null = null;
  let rejection: SessionRejection | null = null;
  let initializing: Promise<void> | undefined;
  let settled = false;
  // 응답을 기다리는 동안 logout하면, 그 전에 보낸 요청의 결과로 다시 로그인하지 않는다.
  let logouts = 0;
  // `true`로 끝나면 IdP 로그아웃으로 떠나는 중이다.
  let pendingLogout: Promise<boolean> | undefined;

  // IdP 로그아웃 화면에서 뒤로 가기로 돌아와 bfcache가 이 페이지를 되살리면, 떠나던 로그아웃은 이미 끝난 것이다.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) pendingLogout = undefined;
  });

  const authenticate = (accessToken: string): void => {
    rejection = null;
    callbackError = null;
    store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
  };

  /**
   * `error`를 생략하면 이미 로그아웃된 상태의 에러를 지우지 않는다. 바뀐 것이 없으면 알리지 않아서, store를 구독해
   * guard를 다시 돌리는 라우터가 같은 상태로 계속 돌지 않게 한다.
   */
  const unauthenticate = (error?: AccountError | null): void => {
    const current = store.getState();
    const next: AccountState = {
      status: 'unauthenticated',
      accessToken: null,
      error:
        error === undefined && current.status === 'unauthenticated'
          ? current.error
          : (error ?? null),
      canRetryLogin: rejection?.ticket !== undefined,
    };
    if (sameState(current, next)) return;

    store.setState(next);
  };

  /** MPA는 로그인을 마친 callback 페이지를 떠나야 하므로, 끝나지 않는 Promise로 그동안의 화면을 유지한다. */
  const leaveCallback = (): Promise<never> | undefined => {
    if (navigation !== 'document' || !callback) return undefined;

    redirect(callback.returnTo, { replace: true });
    return new Promise<never>(() => undefined);
  };

  const startSession = async (
    credential: LoginCredential,
    body?: unknown,
    started = logouts,
  ): Promise<void> => {
    const result = await session.start(credential, body);
    if (logouts !== started) return;

    if ('rejected' in result) {
      rejection = result.rejected;
      throw result.rejected.error;
    }

    flags.removeItem(STORAGE_KEYS.loggedOut);
    authenticate(result.tokens.accessToken);
  };

  const finishCallback = async ({ url, transaction }: Callback): Promise<void> => {
    const started = logouts;
    // 기다리는 동안 logout했으면 머문다. 떠나면 IdP 로그아웃으로 가는 이동을 덮어쓴다.
    const leave = () => (logouts === started ? leaveCallback() : undefined);
    try {
      const params = parseCallback(await metadata(), url, { clientId, state: transaction?.state });
      // web은 항상 openid를 요청하므로 nonce가 없는 transaction은 이 탭이 만든 것이 아니다.
      if (!transaction?.nonce) throw new AccountError('state_mismatch');

      const { codeVerifier, redirectUri: sentRedirectUri, nonce } = transaction;
      await startSession(
        {
          code: params.code,
          codeVerifier,
          redirectUri: sentRedirectUri,
          nonce,
          iss: params.iss,
        },
        undefined,
        started,
      );
    } catch (error) {
      const accountError = toAccountError(error);
      if (transaction?.silent && SILENT_LOGIN_FAILURES.has(accountError.code)) {
        unauthenticate();
        return leave();
      }

      callbackError = accountError;
      unauthenticate(callbackError);
      return;
    }

    return leave();
  };

  const authorize = async (
    returnTo: string,
    prompt: Prompt | undefined,
    silent: boolean,
  ): Promise<void> => {
    const loggedOut = flags.getItem(STORAGE_KEYS.loggedOut) !== null;
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
    // logout이 서버에 닿지 못했으면 refresh 쿠키가 남아 있으므로, 다시 로그인하기 전에는 쓰지 않는다.
    if (flags.getItem(STORAGE_KEYS.loggedOut) !== null) return unauthenticate();

    try {
      const started = logouts;
      const tokens = await oneAtATime(() => session.refresh());
      if (logouts !== started) return;
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

  const endSession = async (
    accessToken: string | null,
    idp: boolean,
    returnTo: string,
  ): Promise<boolean> => {
    await session.end(accessToken).catch(() => undefined);
    if (!idp || !canRoundTrip) return false;

    const logout = createLogoutUrl(await metadata(), {
      clientId,
      postLogoutRedirectUri: redirectUri(),
    });
    if (!logout) return false;

    transactions.setItem(STORAGE_KEYS.logoutPrefix + logout.state, sameOriginPath(returnTo) ?? '/');
    redirect(logout.url);
    return true;
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
      // 로그아웃 요청이 닿기 전에 떠나면 refresh 쿠키가 남고, IdP 로그아웃으로 떠나는 중이면 그 이동을 덮어쓴다.
      if (pendingLogout && (await pendingLogout)) return;

      try {
        if (!canRoundTrip) {
          throw new AccountError('unknown', {
            description: 'site storage is blocked, so the login cannot come back to this page',
          });
        }
        await authorize(returnTo, prompt, false);
      } catch (error) {
        const accountError = toAccountError(error);
        store.setState({ error: accountError });
        throw accountError;
      }
    },

    async retryLogin(body) {
      if (rejection?.ticket === undefined) {
        throw new AccountError('unauthenticated', { description: 'no login to retry' });
      }

      const started = logouts;
      try {
        await startSession({ ticket: rejection.ticket }, body, started);
      } catch (error) {
        if (logouts === started) {
          // 만료된 ticket을 다시 보내지 않도록 이어 갈 로그인을 버린다. 화면은 retryLogin 대신 login을 보여 준다.
          if (error instanceof AccountError.Expired) rejection = null;
          unauthenticate(toAccountError(error));
        }
        throw error;
      }

      if (logouts !== started) {
        throw new AccountError('unauthenticated', {
          description: 'logged out before the login finished',
        });
      }

      void leaveCallback();
    },

    async logout({ idp = false, returnTo = '/' } = {}) {
      const { accessToken } = store.getState();

      rejection = null;
      logouts += 1;
      flags.setItem(STORAGE_KEYS.loggedOut, '1');

      // store 구독자가 바뀐 상태를 받자마자 login()을 불러도 기다리도록 상태를 바꾸기 전에 등록한다. 앞선 로그아웃이
      // 아직 IdP로 떠나는 중이면 그것까지 기다려야, 뒤의 로그아웃이 먼저 끝나도 그 이동을 덮어쓰지 않는다.
      const ending = endSession(accessToken, idp, returnTo);
      const previous = pendingLogout;
      const leaving = ending.catch(() => false);
      const waiting = previous
        ? Promise.all([previous, leaving]).then(([before, now]) => before || now)
        : leaving;
      pendingLogout = waiting;
      void waiting.then((left) => {
        if (!left && pendingLogout === waiting) pendingLogout = undefined;
      });

      unauthenticate(null);
      await ending;
    },

    refresh(staleToken = store.getState().accessToken) {
      return oneAtATime(async () => {
        try {
          const { accessToken } = store.getState();
          if (accessToken && accessToken !== staleToken) return accessToken;

          const started = logouts;
          const tokens =
            flags.getItem(STORAGE_KEYS.loggedOut) === null && (await session.refresh());
          if (logouts !== started) return null;
          if (!tokens) {
            unauthenticate();
            return null;
          }

          authenticate(tokens.accessToken);
          return tokens.accessToken;
        } catch (error) {
          unauthenticate(toAccountError(error));
          return null;
        }
      });
    },

    async fetch(input, init) {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      if (!tokenOrigins.has(url.origin)) return (fetch ?? globalThis.fetch)(input, init);

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
      // 토큰 없이 받은 401은 refresh로 바뀌지 않는다. stream body는 한 번 읽으면 다시 보낼 수 없다.
      const retryable = token !== null && !(init?.body instanceof ReadableStream);
      if (!retryable || !isUnauthorized(response.status)) return response;

      const refreshed = await client.refresh(token);
      return refreshed ? send(refreshed) : response;
    },
  };

  return client;
}

function sessionFromApi(
  api: NonNullable<AccountClientOptions['api']>,
  fetch: Fetch | undefined,
): Session {
  const { baseUrl, paths = {} } = isString(api) ? { baseUrl: api } : api;
  return apiSession(baseUrl, paths, fetch);
}

/** `session`을 준 앱은 백엔드 주소를 알 수 없으므로 페이지 origin을 쓴다. */
function apiOrigin(api: AccountClientOptions['api']): string {
  if (api === undefined) return window.location.origin;

  return isString(api) ? api : api.baseUrl;
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
  returnTo: string;
}

interface CallbackContext {
  redirectUri: string;
  transactions: Storage;
  navigation: 'history' | 'document';
  redirect: Redirect;
}

/**
 * 동기로 처리해야 한다. 라우터가 만들어지기 전에 주소가 바뀌어 있어야 라우터가 callback 주소를 라우팅하지 않는다.
 * 같은 이유로 돌아갈 위치가 든 트랜잭션도 미리 꺼낸다.
 */
function takeCallback({
  redirectUri,
  transactions,
  navigation,
  redirect,
}: CallbackContext): Callback | null {
  const url = window.location.href;
  if (!samePath(new URL(url).pathname, new URL(redirectUri).pathname)) return null;

  const logoutKey = STORAGE_KEYS.logoutPrefix + readCallbackState(url);
  const afterLogout = transactions.getItem(logoutKey);
  if (afterLogout !== null && !isCallbackUrl(url)) {
    transactions.removeItem(logoutKey);
    if (navigation === 'document') redirect(afterLogout, { replace: true });
    else window.history.replaceState(null, '', afterLogout);
    return null;
  }

  if (!isCallbackUrl(url)) return null;

  const transaction = takeTransaction(transactions, readCallbackState(url));
  const returnTo = transaction?.returnTo ?? '/';
  // MPA는 로그인을 마칠 때까지 callback 페이지에 머문다. 그동안 새로고침해도 쓴 code를 다시 보내지 않게 query를 지운다.
  window.history.replaceState(
    null,
    '',
    navigation === 'document' ? new URL(url).pathname : returnTo,
  );

  return { url, transaction, returnTo };
}

/** 정적 호스팅은 `/auth/callback`을 `/auth/callback/`로 리다이렉트하기도 한다. */
function samePath(a: string, b: string): boolean {
  return trimEnd(a, '/') === trimEnd(b, '/');
}

function sameState(a: AccountState, b: AccountState): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.error === b.error &&
    a.canRetryLogin === b.canRetryLogin
  );
}

/** 로그인 뒤 사용자를 다른 사이트로 보내지 않도록 다른 origin은 버린다. */
function sameOriginPath(value: string): string | undefined {
  const [, url] = attempt(() => new URL(value, window.location.origin));
  if (url?.origin !== window.location.origin) return undefined;

  // `//evil.com/x`는 scheme-relative URL이라 문서 이동에서 다른 origin으로 간다.
  return url.pathname.replace(/^\/{2,}/, '/') + url.search + url.hash;
}

function toAccountError(error: unknown): AccountError {
  return AccountError.is(error) ? error : new AccountError('unknown', { cause: error });
}
