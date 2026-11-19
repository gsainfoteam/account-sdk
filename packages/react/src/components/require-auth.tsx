import { useEffect, type ReactNode } from 'react';

import { useAccountClient } from '../context/account-context';
import { useAccount, type UseAccountResult } from '../hooks/use-account';

export interface RequireAuthProps {
  children?: ReactNode;
  /**
   * 로그인되지 않은 동안 보여 준다. 세션을 복구하는 중에도, 로그인이 실패한 뒤에도 보이므로 상태마다 다르게 그리려면
   * 함수로 주고 `isLoading`, `error`, `canRetryLogin`으로 나눈다.
   */
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
