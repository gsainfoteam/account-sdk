import { useMemo } from 'react';

import { type AccountClient, type AccountState } from '@infoteam/account-web';
import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface UseAccountResult<RetryBody = unknown> extends AccountState {
  isLoading: boolean;
  isAuthenticated: boolean;
  loginStartedAt: AccountClient['loginStartedAt'];

  login: AccountClient['login'];
  logout: AccountClient['logout'];
  retryLogin: AccountClient<RetryBody>['retryLogin'];
  fetch: AccountClient['fetch'];
}

/** 상태가 바뀔 때만 새 객체를 돌려줘서, effect의 의존성으로 써도 렌더마다 다시 돌지 않는다. */
export function useAccount<RetryBody = unknown>(): UseAccountResult<RetryBody> {
  const client = useAccountClient<RetryBody>();
  const state = useStore(client.store);

  return useMemo(
    () => ({
      ...state,

      isLoading: state.status === 'loading',
      isAuthenticated: state.status === 'authenticated',
      loginStartedAt: client.loginStartedAt,

      login: client.login,
      logout: client.logout,
      retryLogin: client.retryLogin,
      fetch: client.fetch,
    }),
    [client, state],
  );
}
