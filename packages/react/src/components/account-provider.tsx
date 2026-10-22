import { useEffect, useState, type ReactNode } from 'react';

import { type AccountClient } from '@gsainfoteam/account-web';

import { AccountContext } from '../context/account-context';

export interface AccountProviderProps {
  client: AccountClient;
  /**
   * IdP 에서 돌아온 로그인을 마무리하는 동안 children 대신 보여 준다. 그 밖에는 children 을 바로 그려서,
   * 공개 페이지가 세션 복구를 기다리지 않는다.
   */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** 아래의 hook 과 컴포넌트에 client 를 제공하고, mount 될 때 세션을 준비한다. */
export function AccountProvider({
  client,
  fallback = null,
  children,
}: AccountProviderProps): ReactNode {
  const [handlingRedirect, setHandlingRedirect] = useState(() => client.isHandlingRedirect());

  useEffect(() => {
    void client.ready().then(() => setHandlingRedirect(false));
  }, [client]);

  return <AccountContext value={client}>{handlingRedirect ? fallback : children}</AccountContext>;
}
