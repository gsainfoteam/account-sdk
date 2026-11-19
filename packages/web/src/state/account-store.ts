import { type AccountError } from '@infoteam/account-core';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type AccountState } from '../client/types';
import { type SessionRejection } from '../session/session-adapter';

export interface AccountStore {
  readonly store: StoreApi<AccountState>;
  rejection: SessionRejection | null;
  callbackError: AccountError | null;
  authenticate(accessToken: string): void;
  unauthenticate(error?: AccountError | null): void;
}

export function createAccountStore(): AccountStore {
  const store = createStore<AccountState>(() => ({
    status: 'loading',
    accessToken: null,
    error: null,
    canRetryLogin: false,
  }));

  const account: AccountStore = {
    store,
    rejection: null,
    callbackError: null,

    authenticate(accessToken) {
      account.rejection = null;
      account.callbackError = null;
      store.setState({ status: 'authenticated', accessToken, error: null, canRetryLogin: false });
    },

    /** 바뀐 것이 없을 때도 알리면 store를 구독해 guard를 다시 돌리는 라우터가 같은 상태로 계속 돈다. */
    unauthenticate(error) {
      const current = store.getState();
      const next: AccountState = {
        status: 'unauthenticated',
        accessToken: null,
        error:
          error === undefined && current.status === 'unauthenticated'
            ? current.error
            : (error ?? null),
        canRetryLogin: account.rejection?.ticket !== undefined,
      };
      if (sameState(current, next)) return;

      store.setState(next);
    },
  };

  return account;
}

function sameState(a: AccountState, b: AccountState): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.error === b.error &&
    a.canRetryLogin === b.canRetryLogin
  );
}
