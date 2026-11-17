import { type AccountClient, type AccountState } from '@infoteam/account-web';
import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface UseAccountResult extends AccountState {
  isLoading: boolean;
  isAuthenticated: boolean;

  login: AccountClient['login'];
  logout: AccountClient['logout'];
  retryLogin: AccountClient['retryLogin'];
  fetch: AccountClient['fetch'];
}

export function useAccount(): UseAccountResult {
  const client = useAccountClient();
  const state = useStore(client.store);

  return {
    ...state,

    isLoading: state.status === 'loading',
    isAuthenticated: state.status === 'authenticated',

    login: client.login,
    logout: client.logout,
    retryLogin: client.retryLogin,
    fetch: client.fetch,
  };
}
