import { useEffect, type ReactNode } from 'react';

import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface RequireAuthProps {
  children?: ReactNode;
  /** 세션을 불러오는 동안, 사용자를 로그인으로 보내는 동안, 로그인이 실패했을 때 보여 준다. 실패 이유는 `useAccount().error` 다. */
  fallback?: ReactNode;
  /** `false` 면 redirect 하지 않고 `fallback` 을 렌더링한다. 자체 로그인 페이지가 있는 앱용이다. */
  redirect?: boolean;
}

/**
 * 로그인한 사용자에게만 children 을 렌더링한다. 아니면 현재 페이지로 돌아오는 로그인을 시작한다.
 *
 * 라우터의 guard(`requireAuth`)를 쓸 수 없는 곳에서 쓴다. `<Routes>` 컴포넌트 방식이나 라우터가 없는 앱이다.
 */
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
