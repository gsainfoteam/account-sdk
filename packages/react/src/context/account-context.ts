import { createContext, useContext } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

export const AccountContext = createContext<AccountClient | null>(null);

export function useAccountClient(): AccountClient {
  const client = useContext(AccountContext);
  if (!client) throw new Error('useAccount must be used inside <AccountProvider>');

  return client;
}
