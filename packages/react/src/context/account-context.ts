import { createContext, useContext } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

export const AccountContext = createContext<AccountClient | null>(null);

/** 가장 가까운 {@link AccountProvider} 의 client 를 돌려준다. */
export function useAccountClient(): AccountClient {
  const client = useContext(AccountContext);
  if (!client) throw new Error('useAccount must be used inside <AccountProvider>');

  return client;
}
