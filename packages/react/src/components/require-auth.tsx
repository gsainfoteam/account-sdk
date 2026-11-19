import { useEffect, type ReactNode } from 'react';

import { useAccountClient } from '../context/account-context';
import { useAccount, type UseAccountResult } from '../hooks/use-account';

export interface RequireAuthProps {
  children?: ReactNode;
  fallback?: ReactNode | ((account: UseAccountResult) => ReactNode);
  redirect?: boolean;
}

export function RequireAuth({
  children,
  fallback = null,
  redirect = true,
}: RequireAuthProps): ReactNode {
  const client = useAccountClient();
  const account = useAccount();
  const { status } = account;

  useEffect(() => {
    if (status === 'unauthenticated' && redirect) void client.requireAuth().catch(() => undefined);
  }, [client, redirect, status]);

  if (account.isAuthenticated) return children;

  return typeof fallback === 'function' ? fallback(account) : fallback;
}
