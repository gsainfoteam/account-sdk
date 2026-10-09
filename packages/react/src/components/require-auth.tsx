import { useEffect, type ReactNode } from 'react';

import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface RequireAuthProps {
  children?: ReactNode;
  /** 세션을 불러오는 동안이나 사용자를 로그인으로 보내는 동안 보여 준다. */
  fallback?: ReactNode;
  /** `false` 면 redirect 하지 않고 `fallback` 을 렌더링한다. 자체 로그인 페이지가 있는 앱용이다. */
  redirect?: boolean;
}

/** 로그인한 사용자에게만 children 을 렌더링한다. 아니면 현재 페이지로 돌아오는 로그인을 시작한다. */
export function RequireAuth({
  children,
  fallback = null,
  redirect = true,
}: RequireAuthProps): ReactNode {
  const client = useAccountClient();
  const status = useStore(client.store, (state) => state.status);

  useEffect(() => {
    if (status === 'unauthenticated' && redirect) {
      void client.login({ returnTo: window.location.pathname + window.location.search });
    }
  }, [client, redirect, status]);

  return status === 'authenticated' ? children : fallback;
}
