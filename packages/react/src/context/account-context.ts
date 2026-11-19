import { createContext, useContext } from 'react';

import { type AccountClient } from '@infoteam/account-web';

export const AccountContext = createContext<AccountClient | null>(null);

export function useAccountClient<RetryBody = unknown>(): AccountClient<RetryBody> {
  const client = useContext(AccountContext);
  if (!client) throw new Error('useAccount must be used inside <AccountProvider>');

  return client as AccountClient<RetryBody>;
}
