import {
  CALLBACK_PATH,
  discover,
  fetchClientRegistration,
  type AccountMetadata,
  type ClientScope,
} from '@infoteam/account-core';
import { Mutex } from 'es-toolkit';

import { type AppKind, type ParsedAccountClientOptions, type Redirect } from './options';
import { onRestoredFromBackForwardCache } from '../internal/back-forward-cache';
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
  readonly app: AppKind;
  readonly account: AccountStore;
  readonly refreshMutex: Mutex;
  readonly callback: Callback | null;
  readonly trySilentLogin: boolean;
  readonly logoutGate: LogoutGate;
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
  const flags = isMemoryStorage(persistent) ? browserStorage('sessionStorage') : persistent;
  const flagsReachOtherTabs = flags === persistent;
  const canRoundTrip = !isMemoryStorage(transactions);

  const account = createAccountStore();
  onRestoredFromBackForwardCache(() => account.cancelLeaving());
  const navigate: Redirect =
    options.redirect ??
    ((url, { replace = false } = {}) =>
      replace ? window.location.replace(url) : window.location.assign(url));
  const redirect: Redirect = (url, navigateOptions) => {
    account.leavePage();
    try {
      navigate(url, navigateOptions);
    } catch (error) {
      account.cancelLeaving();
      throw error;
    }
  };
  const app = options.app ?? 'spa';

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

  const refreshMutex = new Mutex();

  const callback = takeCallback({ redirectUri: redirectUri(), transactions, app, redirect });
  const trySilentLogin =
    options.silentLogin === true &&
    canRoundTrip &&
    flagsReachOtherTabs &&
    callback === null &&
    transactions.getItem(STORAGE_KEYS.silentLoginTried) === null &&
    flags.getItem(STORAGE_KEYS.loggedOut) === null;
  if (callback || trySilentLogin) account.expectRedirect();
  const logoutGate = createLogoutGate();

  return {
    clientId,
    session,
    transactions,
    flags,
    canRoundTrip,
    redirect,
    app,
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
