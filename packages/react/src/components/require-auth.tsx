import { useEffect, type ReactNode } from 'react';

import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface RequireAuthProps {
  children?: ReactNode;
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
    if (status === 'unauthenticated' && redirect) {
      void client.signIn({ returnTo: window.location.pathname + window.location.search });
    }
  }, [client, redirect, status]);

  return status === 'authenticated' ? children : fallback;
}
