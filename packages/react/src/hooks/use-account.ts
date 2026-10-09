import { type AccountClient, type AccountState } from '@gsainfoteam/account-web';
import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface UseAccountResult extends AccountState {
  login: AccountClient['login'];
  logout: AccountClient['logout'];
  retryLogin: AccountClient['retryLogin'];
  fetch: AccountClient['fetch'];
}

/** client 의 상태를 구독하고 동작을 노출한다. */
export function useAccount(): UseAccountResult {
  const client = useAccountClient();
  const state = useStore(client.store);

  return {
    ...state,

    login: client.login,
    logout: client.logout,
    retryLogin: client.retryLogin,
    fetch: client.fetch,
  };
}
