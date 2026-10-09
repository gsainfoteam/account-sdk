import { StrictMode } from 'react';

import {
  AccountCallback,
  AccountProvider,
  RequireAuth,
  useAccount,
} from '@gsainfoteam/account-react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';

import { account } from './account';

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
    <RequireAuth fallback={<p>checking session</p>}>
      <button
        onClick={async () => {
          const response = await fetch(
            `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/me`,
          );
          alert(JSON.stringify(await response.json()));
        }}
      >
        who am I
      </button>
    </RequireAuth>
  );
}

function Callback() {
  const navigate = useNavigate();
  return (
    <AccountCallback
      fallback={<p>signing in</p>}
      onSuccess={({ returnTo }) => void navigate({ to: returnTo ?? '/', replace: true })}
      onError={() => void navigate({ to: '/', replace: true })}
    />
  );
}

const root = createRootRoute({ component: Outlet });
const router = createRouter({
  routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: Home }),
    createRoute({ getParentRoute: () => root, path: '/me', component: Me }),
    createRoute({ getParentRoute: () => root, path: '/auth/callback', component: Callback }),
  ]),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountProvider client={account}>
      <RouterProvider router={router} />
    </AccountProvider>
  </StrictMode>,
);
