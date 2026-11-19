import {
  CALLBACK_PATH,
  discover,
  fetchClientRegistration,
  type AccountMetadata,
  type ClientScope,
} from '@infoteam/account-core';
import { Mutex } from 'es-toolkit';

import { type ParsedAccountClientOptions, type Redirect } from './options';
import { takeCallback, type Callback } from '../login/callback';
import { createLogoutGate, type LogoutGate } from '../logout/logout-gate';
import { sessionFromApi } from '../session/api-session';
import { type Session } from '../session/session-adapter';
import { createAccountStore, type AccountStore } from '../state/account-store';
import { browserStorage, isMemoryStorage } from '../storage/browser-storage';
import { STORAGE_KEYS } from '../storage/keys';

export interface AccountContext {
  readonly clientId: string;
  readonly session: Session;
  readonly transactions: Storage;
  readonly flags: Storage;
  readonly canRoundTrip: boolean;
  readonly redirect: Redirect;
  readonly navigation: 'history' | 'document';
  readonly account: AccountStore;
  readonly refreshMutex: Mutex;
  readonly callback: Callback | null;
  readonly trySilentLogin: boolean;
  readonly logoutGate: LogoutGate;
  // logout 전에 보낸 요청의 응답이 늦게 와도 그 결과로 다시 로그인하지 않게 한다.
  logouts: number;
  metadata(): Promise<AccountMetadata>;
  redirectUri(): string;
  scopes(): Promise<ClientScope[]>;
}

export function createContext(options: ParsedAccountClientOptions): AccountContext {
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

  const account = createAccountStore();
  const refreshMutex = new Mutex();

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

  return {
    clientId,
    session,
    transactions,
    flags,
    canRoundTrip,
    redirect,
    navigation,
    account,
    refreshMutex,
    callback,
    trySilentLogin,
    logoutGate,
    logouts: 0,
    metadata,
    redirectUri,
    scopes,
  };
}
