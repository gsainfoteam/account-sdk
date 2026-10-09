import { useEffect, type ReactNode } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

import { AccountContext } from '../context/account-context';

export interface AccountProviderProps {
  client: AccountClient;
  children?: ReactNode;
}

/** 아래의 hook 과 컴포넌트에 client 를 제공하고, mount 될 때 세션을 복구한다. */
export function AccountProvider({ client, children }: AccountProviderProps): ReactNode {
  useEffect(() => {
    void client.ready();
  }, [client]);

  return <AccountContext value={client}>{children}</AccountContext>;
}
