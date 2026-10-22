import { StrictMode } from 'react';

import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { AccountProvider, createAccountClient, RequireAuth, useAccount } from '../src';

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
  const { status, accessToken } = useAccount();
  return <p>{`${status}:${accessToken ?? '-'}`}</p>;
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
    expect(screen.getByText('loading:-')).toBeTruthy();
    await screen.findByText('authenticated:restored');
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
    await screen.findByText('authenticated:service');
  });
});
