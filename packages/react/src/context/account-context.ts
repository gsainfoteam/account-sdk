import { createContext, useContext } from 'react';

import { type AccountClient } from '@infoteam/account-web';

export const AccountContext = createContext<AccountClient | null>(null);

/** `RetryBody`는 `createAccountClient<RetryBody>`에 준 타입을 다시 적는다. Provider의 client와 맞는지는 확인하지 않는다. */
export function useAccountClient<RetryBody = unknown>(): AccountClient<RetryBody> {
  const client = useContext(AccountContext);
  if (!client) throw new Error('useAccount must be used inside <AccountProvider>');

  return client as AccountClient<RetryBody>;
}
