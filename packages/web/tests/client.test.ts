import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { createAccountClient, type AccountClientOptions } from '../src';
import { fakeServers, type Route } from './fake-servers';

const API = 'api.ziggle.gistory.me';
const REGISTRATION = 'api.account.gistory.me/client/ziggle/public';

function setup(routes: Record<string, Route>, overrides: Partial<AccountClientOptions> = {}) {
  const servers = fakeServers(routes);
  const redirect = vi.fn<(url: string) => void>();
  const create = () =>
    createAccountClient({
      issuer: 'production',
      clientId: 'ziggle',
      api: `https://${API}`,
      scopes: ['name', 'email'],
      fetch: servers.fetch,
      redirect,
      ...overrides,
    });
  return { ...servers, client: create(), create, redirect };
}

async function startLogin({ client, redirect }: ReturnType<typeof setup>, returnTo = '/notices/1') {
  await client.login({ returnTo });
  const authorize = new URL(redirect.mock.calls.at(-1)![0]);
  const state = authorize.searchParams.get('state')!;
  return { authorize, state, stored: sessionStorage.getItem(`gsainfoteam-account:tx:${state}`) };
}

async function loginAndReturn(
  servers: ReturnType<typeof setup>,
  query = (state: string) => `code=code-1&state=${state}&iss=https://account.gistory.me`,
) {
  const { authorize, state } = await startLogin(servers);
  window.history.replaceState(null, '', `/auth/callback?${query(state)}`);
  return { authorize, returned: servers.create() };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => clearDiscoveryCache());

describe('createAccountClient', () => {
  it('fails right away on bad options', () => {
    expect(() => createAccountClient({ issuer: 'production', clientId: '', api: '/api' })).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
  });
});

describe('login', () => {
  it('asks for openid with a nonce and an absolute default redirect_uri', async () => {
    const { authorize, stored } = await startLogin(setup({}));

    expect(authorize.origin + authorize.pathname).toBe('https://account.gistory.me/authorize');
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(authorize.searchParams.get('scope')).toBe('openid name email');
    expect(authorize.searchParams.get('nonce')).toBeTruthy();
    expect(authorize.searchParams.has('prompt')).toBe(false);
    expect(stored).toContain('/notices/1');
  });

  it('asks for the scopes registered for the client when none are given', async () => {
    const servers = setup(
      {
        [REGISTRATION]: () =>
          Response.json({
            scopes: ['name'],
            optionalScopes: ['email'],
            tokenEndpointAuthMethod: 'none',
          }),
      },
      { scopes: undefined },
    );
    const { authorize } = await startLogin(servers);

    expect(authorize.searchParams.get('scope')).toBe('openid name email');
  });

  it('asks for the login screen once after signing out, so users can switch accounts', async () => {
    const servers = setup({ [`${API}/auth/logout`]: () => new Response(null, { status: 204 }) });
    await servers.client.logout();
    const { authorize } = await startLogin(servers);

    expect(authorize.searchParams.get('prompt')).toBe('login');
  });

  it.each(['https://evil.example/steal', '//evil.example/steal'])(
    'never returns to another origin (%s)',
    async (returnTo) => {
      const { stored } = await startLogin(setup({}), returnTo);

      expect(stored).not.toContain('evil');
    },
  );
});

describe('the callback page', () => {
  const routes: Record<string, Route> = {
    [`${API}/auth/login`]: ({ body }) =>
      JSON.parse(body).code === 'code-1'
        ? Response.json({ access_token: 'service-token' })
        : new Response(null, { status: 401 }),
  };

  it('moves to where the user was before the router reads the address', async () => {
    const servers = setup(routes);
    const { returned } = await loginAndReturn(servers);

    expect(window.location.pathname).toBe('/notices/1');
    expect(returned.isHandlingRedirect()).toBe(true);
  });

  it('hands the code, verifier and nonce to the service backend, which exchanges it', async () => {
    const servers = setup(routes);
    const { authorize, returned } = await loginAndReturn(servers);
    await returned.ready();

    expect(returned.store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'service-token',
    });
    expect(returned.isHandlingRedirect()).toBe(false);
    expect(JSON.parse(servers.callsTo(`${API}/auth/login`)[0]!.body)).toMatchObject({
      code: 'code-1',
      code_verifier: expect.any(String),
      redirect_uri: 'http://localhost:3000/auth/callback',
      nonce: authorize.searchParams.get('nonce'),
      iss: 'https://account.gistory.me',
      transport: 'cookie',
    });
    expect(servers.callsTo('api.account.gistory.me/oauth/token')).toHaveLength(0);
  });

  it('rejects a callback whose state this browser did not start, without calling the backend', async () => {
    const servers = setup(routes);
    window.history.replaceState(null, '', '/auth/callback?code=code-1&state=forged');
    const returned = servers.create();
    await returned.ready();

    expect(window.location.pathname).toBe('/');
    expect(returned.store.getState()).toMatchObject({
      status: 'unauthenticated',
      error: { code: 'state_mismatch' },
    });
    expect(servers.callsTo(`${API}/auth/login`)).toHaveLength(0);
  });

  it('stops requireAuth with the reason instead of sending the user back to the IdP', async () => {
    const servers = setup(routes);
    const { returned } = await loginAndReturn(
      servers,
      (state) => `error=access_denied&error_description=user_cancelled&state=${state}`,
    );
    servers.redirect.mockClear();

    await expect(returned.requireAuth()).rejects.toMatchObject({ code: 'user_cancelled' });
    expect(servers.redirect).not.toHaveBeenCalled();
  });
});

describe('a service that asks for consent before login (house-moving-out)', () => {
  it('retries the rejected login with the ticket and the consent body', async () => {
    const requiredConsents = { privacy: { requiredVersion: '250302' } };
    const servers = setup({
      [`${API}/auth/login`]: ({ body }) =>
        JSON.parse(body).ticket === 't-1'
          ? Response.json({ access_token: 'service-token' })
          : Response.json(
              { error: 'session_rejected', ticket: 't-1', details: { requiredConsents } },
              { status: 403 },
            ),
    });
    const { returned } = await loginAndReturn(servers);
    await returned.ready();

    expect(returned.store.getState()).toMatchObject({
      status: 'unauthenticated',
      canRetryLogin: true,
      error: { code: 'session_rejected', status: 403, details: { requiredConsents } },
    });

    await returned.retryLogin({ agreedToPrivacy: true });

    expect(returned.store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'service-token',
    });
    expect(JSON.parse(servers.callsTo(`${API}/auth/login`).at(-1)!.body)).toEqual({
      agreedToPrivacy: true,
      ticket: 't-1',
      transport: 'cookie',
    });
  });
});

describe('requireAuth', () => {
  it('passes a signed-in user', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 't' }),
    });

    await expect(client.requireAuth()).resolves.toBeUndefined();
  });

  it('sends a signed-out user to the IdP and holds the navigation', async () => {
    const { client, redirect } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    const guard = client.requireAuth({ returnTo: 'http://localhost:3000/admin?tab=1' });
    const outcome = await Promise.race([
      guard.then(() => 'passed'),
      new Promise((r) => setTimeout(r, 20, 'pending')),
    ]);

    expect(outcome).toBe('pending');
    expect(redirect).toHaveBeenCalledOnce();
    const state = new URL(redirect.mock.calls[0]![0]).searchParams.get('state')!;
    expect(sessionStorage.getItem(`gsainfoteam-account:tx:${state}`)).toContain('/admin?tab=1');
  });
});

describe('ready', () => {
  it('restores the session from the refresh cookie', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
    });
    await client.ready();
    expect(client.store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'restored',
    });
  });

  it('settles as signed out without a cookie', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    await client.ready();
    expect(client.store.getState()).toMatchObject({ status: 'unauthenticated', error: null });
  });
});

describe('fetch', () => {
  it('refreshes once for concurrent 401s and retries each request', async () => {
    let refreshes = 0;
    const { client } = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: `token-${++refreshes}` }),
      [`${API}/notices`]: ({ headers }) =>
        headers.get('authorization') === 'Bearer token-2'
          ? Response.json({ ok: true })
          : new Response(null, { status: 401 }),
    });
    await client.ready();
    expect(client.getAccessToken()).toBe('token-1');

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => client.fetch(`https://${API}/notices`)),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(2);
  });
});

describe('silentLogin', () => {
  const signedOut = { [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }) };

  it('tries prompt=none once per tab when there is no session, and hides the page meanwhile', async () => {
    const servers = setup(signedOut, { silentLogin: true });
    expect(servers.client.isHandlingRedirect()).toBe(true);

    void servers.client.ready();
    await vi.waitFor(() => expect(servers.redirect).toHaveBeenCalledOnce());
    expect(new URL(servers.redirect.mock.calls[0]![0]).searchParams.get('prompt')).toBe('none');

    const again = servers.create();
    expect(again.isHandlingRedirect()).toBe(false);
    await again.ready();
    expect(servers.redirect).toHaveBeenCalledOnce();
  });

  it('comes back signed out without an error when the IdP has no session either', async () => {
    const servers = setup(signedOut, { silentLogin: true });
    void servers.client.ready();
    await vi.waitFor(() => expect(servers.redirect).toHaveBeenCalledOnce());
    const state = new URL(servers.redirect.mock.calls[0]![0]).searchParams.get('state');

    window.history.replaceState(null, '', `/auth/callback?error=login_required&state=${state}`);
    const returned = servers.create();
    await returned.ready();

    expect(returned.store.getState()).toMatchObject({ status: 'unauthenticated', error: null });
    servers.redirect.mockClear();
    void returned.requireAuth();
    await vi.waitFor(() => expect(servers.redirect).toHaveBeenCalledOnce());
    expect(new URL(servers.redirect.mock.calls[0]![0]).searchParams.has('prompt')).toBe(false);
  });

  it('does not sign a user back in right after they signed out', async () => {
    localStorage.setItem('gsainfoteam-account:logged-out', '1');
    const { client, redirect } = setup(signedOut, { silentLogin: true });
    await client.ready();

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('logout with the IdP', () => {
  const routes = { [`${API}/auth/logout`]: () => new Response(null, { status: 204 }) };
  const withoutEndSession = (servers: ReturnType<typeof setup>) => {
    const { end_session_endpoint: _, ...discovery } = production;
    const original = servers.fetch.getMockImplementation()!;
    servers.fetch.mockImplementation(async (input, init) =>
      String(input).endsWith('/.well-known/openid-configuration')
        ? Response.json(discovery)
        : original(input, init),
    );
  };

  it('ends the IdP session through the registered callback URL and comes back to returnTo', async () => {
    const servers = setup(routes);
    await servers.client.logout({ idp: true, returnTo: '/bye' });

    const logout = new URL(servers.redirect.mock.calls[0]![0]);
    expect(logout.origin + logout.pathname).toBe('https://account.gistory.me/logout');
    expect(logout.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/auth/callback',
    );
    expect(servers.callsTo(`${API}/auth/logout`)).toHaveLength(1);

    window.history.replaceState(
      null,
      '',
      `/auth/callback?state=${logout.searchParams.get('state')}`,
    );
    const returned = servers.create();
    expect(window.location.pathname).toBe('/bye');
    expect(returned.isHandlingRedirect()).toBe(false);
  });

  it('only ends the service session when the IdP does not advertise logout', async () => {
    const servers = setup(routes);
    withoutEndSession(servers);
    await servers.client.logout({ idp: true });

    expect(servers.redirect).not.toHaveBeenCalled();
    expect(servers.client.store.getState().status).toBe('unauthenticated');
  });
});
