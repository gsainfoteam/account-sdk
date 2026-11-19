import { createContext, useContext } from 'react';

import { type AccountClient } from '@infoteam/account-web';

export const AccountContext = createContext<AccountClient | null>(null);

/** `requireAuth`, `refresh`, `getAccessToken`처럼 `useAccount`가 주지 않는 기능을 컴포넌트에서 쓸 때 쓴다. */
export function useAccountClient(): AccountClient {
  const client = useContext(AccountContext);
  if (!client) throw new Error('useAccount must be used inside <AccountProvider>');

  return client;
}
