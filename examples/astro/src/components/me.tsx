import { useState } from 'react';

import { AccountProvider, RequireAuth, useAccount } from '@infoteam/account-react';

import { account, API_URL } from '../account';

export function Me() {
  return (
    <AccountProvider client={account}>
      <RequireAuth
        fallback={({ isLoading, error }) =>
          isLoading || !error ? <p>one moment</p> : <p>sign-in failed: {error.kind}</p>
        }
      >
        <WhoAmI />
      </RequireAuth>
    </AccountProvider>
  );
}

function WhoAmI() {
  const { fetch } = useAccount();
  const [me, setMe] = useState<unknown>();

  return (
    <>
      <button
        onClick={async () => {
          const response = await fetch(`${API_URL}/me`);
          setMe(await response.json());
        }}
      >
        who am I
      </button>
      {me !== undefined && <pre>{JSON.stringify(me, null, 2)}</pre>}
    </>
  );
}
