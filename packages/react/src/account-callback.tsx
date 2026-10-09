import { useEffect, useEffectEvent, type ReactNode } from 'react';

import { type AccountError, type CallbackResult } from '@gsainfoteam/account-web';

import { useAccountClient } from './context';

export interface AccountCallbackProps {
  onSuccess: (result: CallbackResult) => void;
  onError: (error: AccountError) => void;
  fallback?: ReactNode;
}

export function AccountCallback({
  onSuccess,
  onError,
  fallback = null,
}: AccountCallbackProps): ReactNode {
  const client = useAccountClient();
  const succeed = useEffectEvent(onSuccess);
  const fail = useEffectEvent(onError);

  useEffect(() => {
    // StrictMode 가 effect 를 두 번 돌려도 교환은 한 번이지만, 결과를 두 번 받으면 앱이 두 번 navigate 한다.
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
