import { StrictMode } from 'react';

import { clearDiscoveryCache } from '@infoteam/account-core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import {
  AccountProvider,
  type AccountProviderProps,
  createAccountClient,
  RequireAuth,
  useAccount,
  type useAccountClient,
} from '../src';

const API = 'https://api.ziggle.gistory.me';

function setup(routes: Record<string, () => Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/.well-known/openid-configuration') return Response.json(production);
    return routes[url.origin + url.pathname]?.() ?? new Response(null, { status: 404 });
  });
  const redirect = vi.fn<(url: string) => void>();
  const create = () =>
    createAccountClient({
      issuer: 'production',
      clientId: 'ziggle',
      api: API,
      scopes: ['name'],
      fetch,
      redirect,
    });
  return { client: create(), create, fetch, redirect };
}

function Status() {
  const { status, accessToken, isLoading, isAuthenticated } = useAccount();
  const flags = [isLoading, isAuthenticated].map(Number).join('');
  return <p>{`${status}:${accessToken ?? '-'}:${flags}`}</p>;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/notices?page=2');
});
afterEach(() => clearDiscoveryCache());

describe('AccountProvider', () => {
  it('restores the session and exposes it through useAccount', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
    });
    render(
      <AccountProvider client={client}>
        <Status />
      </AccountProvider>,
    );
    expect(screen.getByText('loading:-:10')).toBeTruthy();
    await screen.findByText('authenticated:restored:01');
  });

  it('reports a user without a session as unauthenticated', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    render(
      <AccountProvider client={client}>
        <Status />
      </AccountProvider>,
    );
    await screen.findByText('unauthenticated:-:00');
  });
});

describe('AccountProvider while the page leaves', () => {
  it('shows the fallback once a login leaves for the IdP, and the page again if it comes back', async () => {
    const { client, redirect } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    const { container } = render(
      <AccountProvider client={client} fallback={<p>leaving</p>}>
        <Status />
      </AccountProvider>,
    );
    await waitFor(() => expect(container.textContent).toBe('unauthenticated:-:00'));

    await act(() => client.login());
    expect(redirect).toHaveBeenCalledOnce();
    expect(container.textContent).toBe('leaving');

    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    expect(container.textContent).toBe('unauthenticated:-:00');
  });
});

describe('RequireAuth', () => {
  it('sends a logged-out user to the IdP and remembers where they were', async () => {
    const { client, redirect } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    render(
      <AccountProvider client={client}>
        <RequireAuth fallback={<p>checking</p>}>
          <p>secret</p>
        </RequireAuth>
      </AccountProvider>,
    );
    expect(screen.getByText('checking')).toBeTruthy();
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    const state = new URL(redirect.mock.calls[0]![0]).searchParams.get('state');
    expect(sessionStorage.getItem(`gsainfoteam-account:tx:${state}`)).toContain('/notices?page=2');
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('only renders the fallback when redirect is off', async () => {
    const { client, redirect } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    render(
      <AccountProvider client={client}>
        <RequireAuth redirect={false} fallback={<p>please sign in</p>}>
          <p>secret</p>
        </RequireAuth>
      </AccountProvider>,
    );
    await act(() => client.ready());
    expect(screen.getByText('please sign in')).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('lets a fallback function tell restoring apart from a failed login', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 503 }),
    });
    render(
      <AccountProvider client={client}>
        <RequireAuth
          redirect={false}
          fallback={({ isLoading, error }) => <p>{isLoading ? 'restoring' : error?.kind}</p>}
        >
          <p>secret</p>
        </RequireAuth>
      </AccountProvider>,
    );
    expect(screen.getByText('restoring')).toBeTruthy();
    await screen.findByText('network');
  });
});

describe('AccountProvider on the callback page', () => {
  it('shows the fallback until the login is done, then the page the user was on', async () => {
    const { client, create, redirect } = setup({
      [`${API}/auth/login`]: () => Response.json({ access_token: 'service' }),
    });
    await client.login({ returnTo: '/notices/1' });
    const state = new URL(redirect.mock.calls[0]![0]).searchParams.get('state');
    window.history.replaceState(null, '', `/auth/callback?code=c-1&state=${state}`);
    const returned = create();

    render(
      <StrictMode>
        <AccountProvider client={returned} fallback={<p>signing in</p>}>
          <Status />
        </AccountProvider>
      </StrictMode>,
    );
    expect(window.location.pathname).toBe('/notices/1');
    expect(screen.getByText('signing in')).toBeTruthy();
    await screen.findByText('authenticated:service:01');
  });

  it('tells a failed callback screen where the login started', async () => {
    const { client, create, redirect } = setup({
      [`${API}/auth/login`]: () => new Response(null, { status: 403 }),
    });
    await client.login({ returnTo: '/en/notices/1' });
    const state = new URL(redirect.mock.calls[0]![0]).searchParams.get('state');
    window.history.replaceState(null, '', `/auth/callback?code=c-1&state=${state}`);

    function Failed() {
      const { error, loginStartedAt } = useAccount();
      return <p>{`${error?.kind ?? '-'}:${loginStartedAt}`}</p>;
    }
    render(
      <AccountProvider client={create()}>
        <Failed />
      </AccountProvider>,
    );
    await screen.findByText('rejected:/en/notices/1');
  });
});

describe('the retry body type', () => {
  interface Consent {
    agreedToPrivacy: boolean;
  }

  it('is named once on the hook that calls retryLogin and stays unknown elsewhere', () => {
    expectTypeOf<ReturnType<typeof useAccount<Consent>>['retryLogin']>()
      .parameter(0)
      .toEqualTypeOf<Consent>();
    expectTypeOf<ReturnType<typeof useAccountClient<Consent>>['retryLogin']>()
      .parameter(0)
      .toEqualTypeOf<Consent>();
    expectTypeOf<ReturnType<typeof useAccount>['retryLogin']>().parameter(0).toBeUnknown();
  });

  it('carries the client type through AccountProvider', () => {
    expectTypeOf<AccountProviderProps<Consent>['client']>().toEqualTypeOf<
      ReturnType<typeof createAccountClient<Consent>>
    >();
  });
});
