import { useEffect, useEffectEvent, type ReactNode } from 'react';

import { type AccountError, type CallbackResult } from '@gsainfoteam/account-web';

import { useAccountClient } from '../context/account-context';

export interface AccountCallbackProps {
  /** 돌아갈 위치와 함께 한 번 불린다. 보통 그 위치로 이동하는 데 쓴다. */
  onSuccess: (result: CallbackResult) => void;
  onError: (error: AccountError) => void;
  fallback?: ReactNode;
}

/**
 * redirect URI 라우트에 렌더링한다. 로그인을 마무리하고 결과를 한 번만 알린다. effect 가 두 번 도는
 * StrictMode 에서도 마찬가지다.
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
