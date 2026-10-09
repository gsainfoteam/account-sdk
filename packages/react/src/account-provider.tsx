import { useEffect, type ReactNode } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

import { AccountContext } from './context';

export interface AccountProviderProps {
  client: AccountClient;
  children?: ReactNode;
}

export function AccountProvider({ client, children }: AccountProviderProps): ReactNode {
  useEffect(() => {
    void client.ready();
  }, [client]);

  return <AccountContext value={client}>{children}</AccountContext>;
}
