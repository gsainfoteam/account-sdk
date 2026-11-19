import { AccountProvider, useAccount } from '@infoteam/account-react';

import { account } from '../account';

/** island마다 React 트리가 따로 생기므로 각 island가 같은 client로 provider를 둔다. */
export function AccountStatus() {
  return (
    <AccountProvider client={account}>
      <Status />
    </AccountProvider>
  );
}

function Status() {
  const { isLoading, isAuthenticated, login, logout } = useAccount();
  if (isLoading) return <span>…</span>;

  return isAuthenticated ? (
    <button onClick={() => void logout()}>sign out</button>
  ) : (
    <button onClick={() => void login()}>sign in</button>
  );
}
