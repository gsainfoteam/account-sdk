import { useEffect, type ReactNode } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

import { AccountContext } from '../context/account-context';

export interface AccountProviderProps {
  client: AccountClient;
  children?: ReactNode;
}

/** Makes the client available to the hooks and components below and restores the session on mount. */
export function AccountProvider({ client, children }: AccountProviderProps): ReactNode {
  useEffect(() => {
    void client.ready();
  }, [client]);

  return <AccountContext value={client}>{children}</AccountContext>;
}
