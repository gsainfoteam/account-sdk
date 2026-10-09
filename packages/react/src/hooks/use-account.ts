import { type AccountClient, type AccountState } from '@gsainfoteam/account-web';
import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface UseAccountResult extends AccountState {
  signIn: AccountClient['signIn'];
  signOut: AccountClient['signOut'];
  retryLogin: AccountClient['retryLogin'];
  fetch: AccountClient['fetch'];
}

/** Subscribes to the client's state and exposes its actions. */
export function useAccount(): UseAccountResult {
  const client = useAccountClient();
  const state = useStore(client.store);
  return {
    ...state,
    signIn: client.signIn,
    signOut: client.signOut,
    retryLogin: client.retryLogin,
    fetch: client.fetch,
  };
}
