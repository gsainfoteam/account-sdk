import { type AccountError } from '@infoteam/account-core';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from '../client/types';
import { type SessionRejection } from '../session/session-adapter';

type SessionState = Omit<AccountState, 'redirecting'>;

export interface AccountStore {
  readonly store: StoreApi<AccountState>;
  rejection: SessionRejection | null;
  callbackError: AccountError | null;
  authenticate(accessToken: string): void;
  unauthenticate(error?: AccountError | null): void;
  expectRedirect(): void;
  leavePage(): void;
  settleRedirect(): void;
  cancelLeaving(): void;
}

export function createAccountStore(): AccountStore {
  const store = createStore<AccountState>(() => ({
    status: 'loading',
    accessToken: null,
    error: null,
    canRetryLogin: false,
    redirecting: false,
  }));

  let leaving = false;
  const setRedirecting = (redirecting: boolean) => {
    if (store.getState().redirecting !== redirecting) store.setState({ redirecting });
  };

  const account: AccountStore = {
    store,
    rejection: null,
    callbackError: null,

    authenticate(accessToken) {
      account.rejection = null;
      account.callbackError = null;
      store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
    },

    unauthenticate(error) {
      const current = store.getState();
      const next: SessionState = {
        status: 'unauthenticated',
        accessToken: null,
        error:
          error === undefined && current.status === 'unauthenticated'
            ? current.error
            : (error ?? null),
        canRetryLogin: account.rejection?.ticket !== undefined,
      };
      if (sameSession(current, next)) return;

      store.setState(next);
    },

    expectRedirect() {
      setRedirecting(true);
    },

    leavePage() {
      leaving = true;
      setRedirecting(true);
    },

    settleRedirect() {
      setRedirecting(leaving);
    },

    cancelLeaving() {
      leaving = false;
      setRedirecting(false);
    },
  };

  return account;
}

function sameSession(a: SessionState, b: SessionState): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.error === b.error &&
    a.canRetryLogin === b.canRetryLogin
  );
}
