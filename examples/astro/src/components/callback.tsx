import { AccountProvider, useAccount } from '@infoteam/account-react';

import { account } from '../account';

/** 로그인에 성공하면 client가 로그인 전 페이지를 불러오므로, children은 실패했을 때만 보인다. */
export function Callback() {
  return (
    <AccountProvider client={account} fallback={<p>signing in</p>}>
      <Failed />
    </AccountProvider>
  );
}

function Failed() {
  const { error, login, loginReturnTo } = useAccount();
  const from = loginReturnTo ?? '/';

  return (
    <main>
      <p>{error ? `sign-in failed: ${error.kind}` : 'no sign-in in progress'}</p>
      <button onClick={() => void login({ returnTo: from })}>try again</button>
      <a href={from}>go back</a>
    </main>
  );
}
