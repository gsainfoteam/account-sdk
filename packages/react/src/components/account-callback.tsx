import { useEffect, useEffectEvent, type ReactNode } from 'react';

import { type AccountError, type CallbackResult } from '@gsainfoteam/account-web';

import { useAccountClient } from '../context/account-context';

export interface AccountCallbackProps {
  /** Called once with where to return, typically to navigate there. */
  onSuccess: (result: CallbackResult) => void;
  onError: (error: AccountError) => void;
  fallback?: ReactNode;
}

/**
 * Render on the redirect URI route. Completes the sign-in and reports the result once, even under
 * StrictMode where the effect runs twice.
 *
 * @example
 * ```tsx
 * <AccountCallback
 *   fallback={<Spinner />}
 *   onSuccess={({ returnTo }) => navigate({ to: returnTo ?? '/' })}
 *   onError={() => navigate({ to: '/' })}
 * />
 * ```
 */
export function AccountCallback({
  onSuccess,
  onError,
  fallback = null,
}: AccountCallbackProps): ReactNode {
  const client = useAccountClient();
  const succeed = useEffectEvent(onSuccess);
  const fail = useEffectEvent(onError);

  useEffect(() => {
    let active = true;
    client.handleCallback().then(
      (result) => active && succeed(result),
      (error: AccountError) => active && fail(error),
    );
    return () => {
      active = false;
    };
  }, [client]);

  return fallback;
}
