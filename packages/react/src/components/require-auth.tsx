import { useEffect, type ReactNode } from 'react';

import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface RequireAuthProps {
  children?: ReactNode;
  /** 로그인이 실패했을 때도 보여 준다. 실패 이유는 `useAccount().error` 다. */
  fallback?: ReactNode;
  redirect?: boolean;
}

export function RequireAuth({
  children,
  fallback = null,
  redirect = true,
}: RequireAuthProps): ReactNode {
  const client = useAccountClient();
  const status = useStore(client.store, (state) => state.status);

  useEffect(() => {
    if (status === 'unauthenticated' && redirect) void client.requireAuth().catch(() => undefined);
  }, [client, redirect, status]);

  return status === 'authenticated' ? children : fallback;
}
