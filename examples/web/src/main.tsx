import { StrictMode } from 'react';

import { AccountError, AccountProvider, useAccount } from '@gsainfoteam/account-react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';

import { account, API_URL } from './account';

function Home() {
  const { status, error, login, logout } = useAccount();
  return (
    <main>
      <p>status: {status}</p>
      {error && <p>error: {error.code}</p>}
      {status === 'authenticated' ? (
        <button onClick={() => void logout()}>sign out</button>
      ) : (
        <button onClick={() => void login({ returnTo: '/me' })}>sign in</button>
      )}
    </main>
  );
}

function Me() {
  const { fetch } = useAccount();
  return (
    <button
      onClick={async () => {
        const response = await fetch(`${API_URL}/me`);
        alert(JSON.stringify(await response.json()));
      }}
    >
      who am I
    </button>
  );
}

function SignInFailed({ error }: ErrorComponentProps) {
  const { login } = useAccount();
  return (
    <main>
      <p>sign-in failed: {AccountError.is(error) ? error.code : 'unknown'}</p>
      <button onClick={() => void login()}>try again</button>
    </main>
  );
}

const root = createRootRoute({ component: Outlet });
const authRequired = createRoute({
  getParentRoute: () => root,
  id: 'auth-required',
  beforeLoad: ({ location }) => account.requireAuth({ returnTo: location.href }),
  errorComponent: SignInFailed,
});
const router = createRouter({
  routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: Home }),
    authRequired.addChildren([
      createRoute({ getParentRoute: () => authRequired, path: '/me', component: Me }),
    ]),
  ]),
});

account.store.subscribe(() => void router.invalidate());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountProvider client={account} fallback={<p>signing in</p>}>
      <RouterProvider router={router} />
    </AccountProvider>
  </StrictMode>,
);
