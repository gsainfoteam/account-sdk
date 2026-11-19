import { useEffect, type ReactNode } from 'react';

import { type AccountClient } from '@infoteam/account-web';
import { useStore } from 'zustand';

import { AccountContext } from '../context/account-context';

export interface AccountProviderProps<RetryBody = unknown> {
  client: AccountClient<RetryBody>;
  /**
   * IdP에서 돌아온 사용자의 로그인을 마무리하거나 자동 로그인을 시도하는 동안 children 대신 보여 준다. 그 밖에는
   * children을 바로 그려서, 공개 페이지가 세션 복구를 기다리지 않는다.
   */
  fallback?: ReactNode;
  children?: ReactNode;
}

export function AccountProvider<RetryBody = unknown>({
  client,
  fallback = null,
  children,
}: AccountProviderProps<RetryBody>): ReactNode {
  const redirecting = useStore(client.store, (state) => state.redirecting);

  useEffect(() => {
    void client.ready();
  }, [client]);

  return <AccountContext value={client}>{redirecting ? fallback : children}</AccountContext>;
}
