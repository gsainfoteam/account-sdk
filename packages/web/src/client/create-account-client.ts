import {
  AccountError,
  CALLBACK_PATH,
  createAuthorization,
  createLogoutUrl,
  discover,
  fetchClientRegistration,
  OPENID_SCOPE,
  parseCallback,
  type ClientScope,
  type Prompt,
} from '@infoteam/account-core';
import { Mutex } from 'es-toolkit';
import * as z from 'zod/mini';
import { createStore } from 'zustand/vanilla';

import { type AccountClient } from './account-client';
import { sameState, type AccountState } from './account-state';
import { authorizedFetch } from './authorized-fetch';
import { SILENT_LOGIN_FAILURES, takeCallback, type Callback } from './callback';
import { createLogoutGate } from './logout-gate';
import { AccountClientOptionsSchema, type AccountClientOptions, type Redirect } from './options';
import { createServerClient } from './server-client';
import { apiOrigin, sameOriginPath } from './urls';
import { sessionFromApi } from '../session/api-session';
import { type LoginCredential, type SessionRejection } from '../session/session-adapter';
import { browserStorage, isMemoryStorage } from '../storage/browser-storage';
import { STORAGE_KEYS } from '../storage/keys';
import { saveTransaction } from '../storage/transactions';

export type {
  AccountClient,
  LoginOptions,
  LogoutOptions,
  RequireAuthOptions,
} from './account-client';

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

  const { clientId, fetch } = options;
  const session = options.session ?? sessionFromApi(options.api!, fetch);
  const transactions = options.transactionStorage ?? browserStorage('sessionStorage');
  const persistent = browserStorage('localStorage');
  // localStorage만 막혀도 로그아웃 표식이 새로고침에 사라지지 않게 탭에라도 남긴다.
  const flags = isMemoryStorage(persistent) ? browserStorage('sessionStorage') : persistent;
  // 메모리에 둔 로그인 진행 정보는 IdP에 다녀오는 동안 사라져서, 돌아와도 `state_mismatch`로 끝난다.
  const canRoundTrip = !isMemoryStorage(transactions);
  const redirect: Redirect =
    options.redirect ??
    ((url, { replace = false } = {}) =>
      replace ? window.location.replace(url) : window.location.assign(url));
  const navigation = options.callbackNavigation ?? 'history';

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
    // 탭에 남긴 로그아웃 표식은 새 탭에 없어서, 로그아웃한 사용자를 IdP 세션으로 다시 로그인시킨다.
    !isMemoryStorage(persistent) &&
    callback === null &&
    transactions.getItem(STORAGE_KEYS.silentLoginTried) === null &&
    flags.getItem(STORAGE_KEYS.loggedOut) === null;
  const logoutGate = createLogoutGate();
  let callbackError: AccountError | null = null;
  let rejection: SessionRejection | null = null;
  let initializing: Promise<void> | undefined;
  let settled = false;
  // logout 전에 보낸 요청의 응답이 늦게 와도 그 결과로 다시 로그인하지 않게 한다.
  let logouts = 0;

  const authenticate = (accessToken: string): void => {
    rejection = null;
    callbackError = null;
    store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
  };

  /** 바뀐 것이 없을 때도 알리면 store를 구독해 guard를 다시 돌리는 라우터가 같은 상태로 계속 돈다. */
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
    // 기다리는 동안 logout했으면 떠나지 않는다. 떠나면 IdP 로그아웃으로 가는 이동을 덮어쓴다.
    const leave = () => (logouts === started ? leaveCallback() : undefined);
    try {
      const params = parseCallback(await metadata(), url, { clientId, state: transaction?.state });
      // web은 항상 openid를 요청하므로 nonce가 없는 transaction은 이 탭이 만든 것이 아니다.
      if (!transaction?.nonce) throw new AccountError('state_mismatch');

      const { codeVerifier, redirectUri: sentRedirectUri, nonce } = transaction;
      await startSession(
        { code: params.code, codeVerifier, redirectUri: sentRedirectUri, nonce, iss: params.iss },
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
    if (await logoutGate.isLeaving()) return;

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
      // 다시 IdP로 보내면 취소한 사용자가 IdP 화면에서 빠져나갈 수 없다.
      if (callbackError) throw callbackError;

      await client.login({ returnTo });
      return new Promise<never>(() => undefined);
    },

    async login({ returnTo = window.location.href, prompt } = {}) {
      if (await logoutGate.isLeaving()) return;

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

      const ending = endSession(accessToken, idp, returnTo);
      // store 구독자가 바뀐 상태를 받자마자 login()을 불러도 기다리도록 상태를 바꾸기 전에 등록한다.
      logoutGate.track(ending);
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

    fetch: authorizedFetch({
      tokenOrigins: new Set(
        [apiOrigin(options.api), ...(options.tokenOrigins ?? [])].map(
          (origin) => new URL(origin, window.document.baseURI).origin,
        ),
      ),
      fetch,
      ready: () => client.ready(),
      getAccessToken: () => client.getAccessToken(),
      refresh: (staleToken) => client.refresh(staleToken),
    }),
  };

  return client;
}

function toAccountError(error: unknown): AccountError {
  return AccountError.is(error) ? error : new AccountError('unknown', { cause: error });
}
