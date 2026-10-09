import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bodySession, cookieSession, createAccountClient, type AccountClientOptions } from '../src';
import { fakeServers, tokenResponse, type Route } from './fake-servers';

const API = 'api.ziggle.gistory.me';

function setup(routes: Record<string, Route>, overrides: Partial<AccountClientOptions> = {}) {
  const servers = fakeServers(routes);
  const redirect = vi.fn<(url: string) => void>();
  const client = createAccountClient({
    issuer: 'production',
    clientId: 'ziggle',
    redirectUri: '/auth/callback',
    scopes: ['name', 'email'],
    exchange: 'browser',
    session: cookieSession({ baseUrl: `https://${API}`, fetch: servers.fetch }),
    fetch: servers.fetch,
    redirect,
    ...overrides,
  });
  return { ...servers, client, redirect };
}

async function signInAndReturn(
  client: ReturnType<typeof setup>['client'],
  redirect: ReturnType<typeof setup>['redirect'],
  query = '',
) {
  await client.signIn({ returnTo: '/notices/1' });
  const authorize = new URL(redirect.mock.calls.at(-1)![0]);
  const state = authorize.searchParams.get('state')!;
  const callback = `http://localhost:3000/auth/callback?code=code-1&state=${state}&iss=https://api.account.gistory.me${query}`;
  return { authorize, state, callback };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => clearDiscoveryCache());

describe('createAccountClient', () => {
  it('fails right away on bad options', () => {
    expect(() =>
      createAccountClient({
        issuer: 'production',
        clientId: '',
        redirectUri: '/cb',
        scopes: ['name'],
        exchange: 'browser',
        session: {} as never,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });
});

describe('signIn', () => {
  it('redirects to the IdP with an absolute redirect_uri and no prompt', async () => {
    const { client, redirect } = setup({});
    const { authorize, state } = await signInAndReturn(client, redirect);
    expect(authorize.origin + authorize.pathname).toBe('https://account.gistory.me/authorize');
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(authorize.searchParams.get('scope')).toBe('name email');
    expect(authorize.searchParams.has('prompt')).toBe(false);
    expect(sessionStorage.getItem(`gsainfoteam-account:tx:${state}`)).toContain('/notices/1');
  });

  it('asks for the login screen once after signing out, so users can switch accounts', async () => {
    const { client, redirect } = setup({
      [`${API}/auth/logout`]: () => new Response(null, { status: 201 }),
    });
    await client.signOut();
    const { authorize } = await signInAndReturn(client, redirect);
    expect(authorize.searchParams.get('prompt')).toBe('login');
  });

  it('adds offline_access with prompt=consent only when asked', async () => {
    const { client, redirect } = setup({}, { offlineAccess: true });
    const { authorize } = await signInAndReturn(client, redirect);
    expect(authorize.searchParams.get('scope')).toBe('name email offline_access');
    expect(authorize.searchParams.get('prompt')).toBe('consent');
  });
});

describe('handleCallback with the browser exchange and a cookie session', () => {
  const routes: Record<string, Route> = {
    'api.account.gistory.me/oauth/token': () => tokenResponse('idp-token'),
    [`${API}/auth/login`]: ({ headers }) =>
      headers.get('authorization') === 'Bearer idp-token'
        ? Response.json({ access_token: 'service-token' })
        : new Response(null, { status: 401 }),
  };

  it('exchanges the code, logs in to the service and returns where the user was', async () => {
    const { client, redirect, callsTo } = setup(routes);
    const { callback } = await signInAndReturn(client, redirect);
    await expect(client.handleCallback(callback)).resolves.toEqual({ returnTo: '/notices/1' });
    expect(client.store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'service-token',
    });
    expect(callsTo('api.account.gistory.me/oauth/token')).toHaveLength(1);
  });

  it('exchanges once when StrictMode runs the callback twice', async () => {
    const { client, redirect, callsTo } = setup(routes);
    const { callback } = await signInAndReturn(client, redirect);
    await Promise.all([client.handleCallback(callback), client.handleCallback(callback)]);
    expect(callsTo('api.account.gistory.me/oauth/token')).toHaveLength(1);
    expect(callsTo(`${API}/auth/login`)).toHaveLength(1);
  });

  it('rejects a callback whose state this browser did not start', async () => {
    const { client, callsTo } = setup(routes);
    await expect(
      client.handleCallback('http://localhost:3000/auth/callback?code=code-1&state=forged'),
    ).rejects.toMatchObject({ code: 'state_mismatch' });
    expect(client.store.getState()).toMatchObject({
      status: 'unauthenticated',
      error: { code: 'state_mismatch' },
    });
    expect(callsTo('api.account.gistory.me/oauth/token')).toHaveLength(0);
  });

  it('reports the reason the user was turned away', async () => {
    const { client, redirect } = setup(routes);
    const { state } = await signInAndReturn(client, redirect);
    await expect(
      client.handleCallback(
        `http://localhost:3000/auth/callback?error=access_denied&error_description=user_cancelled&state=${state}`,
      ),
    ).rejects.toMatchObject({ code: 'user_cancelled' });
  });
});

describe('a service that asks for consent before login (house-moving-out-be)', () => {
  it('keeps the IdP token so the login can be retried with the consent body', async () => {
    const requiredConsents = { privacy: { requiredVersion: '250302' } };
    const { client, redirect, callsTo } = setup({
      'api.account.gistory.me/oauth/token': () => tokenResponse('idp-token'),
      [`${API}/auth/login`]: ({ body }) =>
        body
          ? Response.json({ access_token: 'service-token' })
          : Response.json(
              { statusCode: 403, errorCode: 'CONSENT_REQUIRED', requiredConsents },
              { status: 403 },
            ),
    });
    const { callback } = await signInAndReturn(client, redirect);

    await expect(client.handleCallback(callback)).rejects.toMatchObject({
      code: 'session_rejected',
      status: 403,
      details: { requiredConsents },
    });
    expect(client.store.getState()).toMatchObject({
      status: 'unauthenticated',
      canRetryLogin: true,
    });

    await client.retryLogin({ agreedToPrivacy: true });
    expect(client.store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'service-token',
    });
    const retry = callsTo(`${API}/auth/login`).at(-1)!;
    expect(retry.headers.get('authorization')).toBe('Bearer idp-token');
    expect(JSON.parse(retry.body)).toEqual({ agreedToPrivacy: true });
  });
});

describe('the backend exchange with a body session (chatbot)', () => {
  it('hands the code to the backend and keeps its refresh token', async () => {
    const servers = fakeServers({
      [`${API}/v1/auth/admin/login`]: ({ body }) => {
        expect(JSON.parse(body)).toMatchObject({
          code: 'code-1',
          redirect_uri: 'http://localhost:3000/auth/callback',
        });
        return Response.json({
          access_token: 'service-token',
          refresh_token: 'rt-1',
          expires_in: 3600,
        });
      },
      [`${API}/v1/auth/admin/refresh`]: ({ body }) =>
        JSON.parse(body).refresh_token === 'rt-1'
          ? Response.json({ access_token: 'service-token-2', refresh_token: 'rt-2' })
          : new Response(null, { status: 401 }),
    });
    const redirect = vi.fn<(url: string) => void>();
    const client = createAccountClient({
      issuer: 'production',
      clientId: 'chatbot',
      redirectUri: '/auth/callback',
      scopes: ['openid', 'name'],
      exchange: 'backend',
      session: bodySession({
        baseUrl: `https://${API}`,
        paths: {
          login: '/v1/auth/admin/login',
          refresh: '/v1/auth/admin/refresh',
          logout: '/v1/auth/admin/logout',
        },
        fetch: servers.fetch,
      }),
      fetch: servers.fetch,
      redirect,
    });
    const { callback, authorize } = await signInAndReturn(client, redirect);
    expect(authorize.searchParams.get('nonce')).toBeTruthy();

    await client.handleCallback(callback);
    expect(
      JSON.parse(servers.callsTo(`${API}/v1/auth/admin/login`)[0]!.body).code_verifier,
    ).toBeTruthy();
    expect(servers.callsTo('api.account.gistory.me/oauth/token')).toHaveLength(0);
    expect(localStorage.getItem('gsainfoteam-account:refresh-token')).toBe('rt-1');

    await expect(client.refresh()).resolves.toBe('service-token-2');
    expect(localStorage.getItem('gsainfoteam-account:refresh-token')).toBe('rt-2');
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
