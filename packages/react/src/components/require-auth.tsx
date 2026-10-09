import { useEffect, type ReactNode } from 'react';

import { useStore } from 'zustand';

import { useAccountClient } from '../context/account-context';

export interface RequireAuthProps {
  children?: ReactNode;
  /** Shown while the session is loading or the user is being sent to sign in. */
  fallback?: ReactNode;
  /** Set to `false` to render `fallback` instead of redirecting, for apps with their own login page. */
  redirect?: boolean;
}

/** Renders its children only for a signed-in user. Otherwise starts a sign-in that returns to the current page. */
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
