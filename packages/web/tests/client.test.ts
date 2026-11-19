import { clearDiscoveryCache } from '@infoteam/account-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { createAccountClient, type AccountClientOptions, type Session } from '../src';
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

  it.each([
    ['neither', {}],
    ['both', { api: '/api', session: customSession() }],
  ])('needs exactly one of api and session, not %s', (_, backend) => {
    expect(() =>
      createAccountClient({ issuer: 'production', clientId: 'ziggle', ...backend }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });
});

function customSession(overrides: Partial<Session> = {}): Session {
  return {
    start: vi.fn<Session['start']>(async () => ({ tokens: { accessToken: 'custom-token' } })),
    refresh: vi.fn<Session['refresh']>(async () => null),
    end: vi.fn<Session['end']>(async () => undefined),
    ...overrides,
  };
}

describe('a backend with its own session format', () => {
  it('restores the session through the methods of a class instance', async () => {
    class ClassSession implements Session {
      private readonly token = 'restored-token';
      start = customSession().start;
      async refresh() {
        return { accessToken: this.token };
      }
      async end() {}
    }
    const { client } = setup({}, { api: undefined, session: new ClassSession() });

    await client.ready();

    expect(client.getAccessToken()).toBe('restored-token');
  });

  it('logs in, refreshes and logs out through the given session instead of the protocol', async () => {
    const session = customSession({
      refresh: vi.fn<Session['refresh']>(async () => ({ accessToken: 'refreshed-token' })),
    });
    const servers = setup(
      {
        [`${API}/me`]: ({ headers }) =>
          new Response(null, {
            status: headers.get('authorization') === 'Bearer refreshed-token' ? 200 : 401,
          }),
      },
      { api: undefined, session, tokenOrigins: [`https://${API}`] },
    );
    const { authorize, returned } = await loginAndReturn(servers);
    await returned.ready();

    expect(session.start).toHaveBeenCalledWith(
      {
        code: 'code-1',
        codeVerifier: expect.any(String),
        redirectUri: 'http://localhost:3000/auth/callback',
        nonce: authorize.searchParams.get('nonce'),
        iss: 'https://account.gistory.me',
      },
      undefined,
    );
    expect(returned.getAccessToken()).toBe('custom-token');

    expect((await returned.fetch(`https://${API}/me`)).status).toBe(200);
    expect(session.refresh).toHaveBeenCalledOnce();

    await returned.logout();
    expect(session.end).toHaveBeenCalledWith('refreshed-token');
    expect(servers.callsTo(`${API}/auth/login`)).toHaveLength(0);
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

  it('keeps the reason in the store when the IdP cannot be reached', async () => {
    const servers = setup({});
    servers.fetch.mockRejectedValue(new TypeError('offline'));

    await expect(servers.client.login()).rejects.toMatchObject({ kind: 'network' });
    expect(servers.client.store.getState().error).toMatchObject({ code: 'network_error' });
    expect(servers.redirect).not.toHaveBeenCalled();
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

  it('finishes a callback that the host redirected to a trailing slash', async () => {
    const servers = setup(routes);
    const { state } = await startLogin(servers);
    window.history.replaceState(null, '', `/auth/callback/?code=code-1&state=${state}`);
    const returned = servers.create();
    await returned.ready();

    expect(window.location.pathname).toBe('/notices/1');
    expect(returned.store.getState().status).toBe('authenticated');
  });

  describe('in an app that loads a document per page', () => {
    const document = { callbackNavigation: 'document' } as const;

    it('stays on the callback page until the login is done, then loads where the user was', async () => {
      const servers = setup(routes, document);
      const { returned } = await loginAndReturn(servers);

      expect(window.location.pathname + window.location.search).toBe('/auth/callback');
      expect(returned.isHandlingRedirect()).toBe(true);

      void returned.ready();
      await vi.waitFor(() =>
        expect(servers.redirect).toHaveBeenLastCalledWith('/notices/1', { replace: true }),
      );
      expect(returned.store.getState().status).toBe('authenticated');
      expect(returned.isHandlingRedirect()).toBe(true);
    });

    it('stays on the callback page to show a failed login', async () => {
      const servers = setup(routes, document);
      const { returned } = await loginAndReturn(servers, (state) => `code=bad&state=${state}`);
      servers.redirect.mockClear();
      await returned.ready();

      expect(servers.redirect).not.toHaveBeenCalled();
      expect(returned.isHandlingRedirect()).toBe(false);
      expect(returned.store.getState().status).toBe('unauthenticated');
    });

    it('keeps a returnTo with a doubled slash on this site', async () => {
      const servers = setup(routes, document);
      await servers.client.login({ returnTo: `${window.location.origin}//evil.example/x?y=1#z` });
      const state = new URL(servers.redirect.mock.calls.at(-1)![0]).searchParams.get('state')!;
      window.history.replaceState(null, '', `/auth/callback?code=code-1&state=${state}`);

      void servers.create().ready();
      await vi.waitFor(() =>
        expect(servers.redirect).toHaveBeenLastCalledWith('/evil.example/x?y=1#z', {
          replace: true,
        }),
      );
    });

    it('stays for an IdP logout that started while the login was finishing', async () => {
      let respond = () => undefined as void;
      const servers = setup(
        {
          [`${API}/auth/login`]: () =>
            new Promise<Response>((resolve) => {
              respond = () => resolve(Response.json({ access_token: 'service-token' }));
            }),
          [`${API}/auth/logout`]: () => new Response(null, { status: 204 }),
        },
        document,
      );
      const { returned } = await loginAndReturn(servers);
      servers.redirect.mockClear();

      const ready = returned.ready();
      await vi.waitFor(() => expect(servers.callsTo(`${API}/auth/login`)).toHaveLength(1));
      await returned.logout({ idp: true });
      respond();
      await ready;

      expect(servers.redirect).toHaveBeenCalledOnce();
      expect(new URL(servers.redirect.mock.calls[0]![0]).pathname).toBe('/logout');
      expect(returned.store.getState().status).toBe('unauthenticated');
    });
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

  it('rejects the retry when a logout happens while it waits', async () => {
    let respond: (() => void) | undefined;
    const servers = setup({
      [`${API}/auth/login`]: async ({ body }) => {
        if (JSON.parse(body).ticket !== 't-1') {
          return Response.json({ error: 'session_rejected', ticket: 't-1' }, { status: 403 });
        }
        await new Promise<void>((resolve) => (respond = resolve));
        return Response.json({ access_token: 'service-token' });
      },
      [`${API}/auth/logout`]: () => new Response(null, { status: 204 }),
    });
    const { returned } = await loginAndReturn(servers);
    await returned.ready();

    const retry = returned.retryLogin({ agreedToPrivacy: true });
    await vi.waitFor(() => expect(respond).toBeDefined());
    await returned.logout();
    respond!();

    await expect(retry).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(returned.store.getState()).toMatchObject({
      status: 'unauthenticated',
      accessToken: null,
      error: null,
    });
  });

  it.each([
    [400, { error: 'invalid_request' }, 'invalid_request'],
    [400, { message: 'Bad Request' }, 'unknown'],
    [502, { message: 'Bad Gateway' }, 'server_error'],
  ])('does not treat a %i login failure (%o) as a rejection', async (status, details, code) => {
    const servers = setup({
      [`${API}/auth/login`]: () => Response.json(details, { status }),
    });
    const { returned } = await loginAndReturn(servers);
    await returned.ready();

    expect(returned.store.getState()).toMatchObject({
      status: 'unauthenticated',
      canRetryLogin: false,
      error: { code, status, cause: details },
    });
  });

  it('tells the screen why the login was rejected and when the ticket ran out', async () => {
    const servers = setup({
      [`${API}/auth/login`]: ({ body }) =>
        JSON.parse(body).ticket === 't-1'
          ? Response.json({ error: 'invalid_ticket' }, { status: 401 })
          : Response.json(
              { error: 'session_rejected', ticket: 't-1', reason: 'terms_required' },
              { status: 403 },
            ),
    });
    const { returned } = await loginAndReturn(servers);
    await returned.ready();

    expect(returned.store.getState().error).toMatchObject({
      code: 'session_rejected',
      kind: 'rejected',
      reason: 'terms_required',
    });
    await expect(returned.retryLogin({ nickname: 'zig' })).rejects.toMatchObject({
      code: 'invalid_ticket',
      kind: 'expired',
    });
    expect(returned.store.getState()).toMatchObject({
      canRetryLogin: false,
      error: { kind: 'expired' },
    });
    await expect(returned.retryLogin({ nickname: 'zig' })).rejects.toMatchObject({
      code: 'unauthenticated',
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

  it('stays signed out after a logout that never reached the server', async () => {
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
      [`${API}/auth/logout`]: () => {
        throw new TypeError('offline');
      },
    });
    await servers.client.ready();
    await servers.client.logout();

    expect(await servers.client.refresh()).toBeNull();

    const reloaded = servers.create();
    await reloaded.ready();
    expect(await reloaded.refresh()).toBeNull();
    expect(reloaded.store.getState()).toMatchObject({ status: 'unauthenticated' });
    expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1);
  });

  it('ignores a refresh that finishes after a logout', async () => {
    let respond = (_: Response) => undefined as void;
    const servers = setup({
      [`${API}/auth/refresh`]: () => new Promise<Response>((resolve) => (respond = resolve)),
      [`${API}/auth/logout`]: () => new Response(null, { status: 204 }),
    });
    const restoring = servers.client.ready();
    await vi.waitFor(() => expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1));

    await servers.client.logout();
    respond(Response.json({ access_token: 'late' }));
    await restoring;
    expect(servers.client.store.getState()).toMatchObject({
      status: 'unauthenticated',
      accessToken: null,
    });
  });

  it('hands the restored token to a refresh called while restoring, without a second request', async () => {
    let respond = (_: Response) => undefined as void;
    const servers = setup({
      [`${API}/auth/refresh`]: () => new Promise<Response>((resolve) => (respond = resolve)),
    });
    const restoring = servers.client.ready();
    await vi.waitFor(() => expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1));

    const refreshing = servers.client.refresh();
    respond(Response.json({ access_token: 'restored' }));
    await restoring;

    expect(await refreshing).toBe('restored');
    expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1);
  });

  describe('when the browser blocks site storage', () => {
    beforeEach(() => {
      const blocked = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked);
      vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(blocked);
    });
    afterEach(() => vi.restoreAllMocks());

    it('still restores and ends the session', async () => {
      const servers = setup({
        [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
        [`${API}/auth/logout`]: () => new Response(null, { status: 204 }),
      });
      await servers.client.ready();
      expect(servers.client.getAccessToken()).toBe('restored');

      await servers.client.logout({ idp: true });
      expect(servers.client.store.getState().status).toBe('unauthenticated');
      expect(servers.redirect).not.toHaveBeenCalled();
    });

    it('refuses to start a login that could not come back, instead of failing at the callback', async () => {
      const servers = setup({ [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }) });
      await servers.client.ready();

      await expect(servers.client.login()).rejects.toMatchObject({
        code: 'unknown',
        message: expect.stringContaining('storage is blocked'),
      });
      expect(servers.client.store.getState().error).toMatchObject({ code: 'unknown' });
      expect(servers.redirect).not.toHaveBeenCalled();
    });

    it('does not try a silent login', async () => {
      const servers = setup(
        { [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }) },
        { silentLogin: true },
      );
      await servers.client.ready();

      expect(servers.redirect).not.toHaveBeenCalled();
      expect(servers.client.store.getState().status).toBe('unauthenticated');
    });

    it('reports a callback that arrives anyway as state_mismatch', async () => {
      window.history.replaceState(null, '', '/auth/callback?code=code-1&state=s-1');
      const servers = setup({});
      await servers.client.ready();

      expect(servers.client.store.getState().error).toMatchObject({ code: 'state_mismatch' });
      expect(servers.callsTo(`${API}/auth/login`)).toHaveLength(0);
    });
  });

  it('settles as signed out without a cookie', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
    });
    await client.ready();
    expect(client.store.getState()).toMatchObject({ status: 'unauthenticated', error: null });
  });

  it('reports a failing refresh endpoint as server_error', async () => {
    const { client } = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 503 }),
    });
    await client.ready();
    expect(client.store.getState()).toMatchObject({
      status: 'unauthenticated',
      error: { code: 'server_error', status: 503 },
    });
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

  it('leaves a 401 sent without a token alone, so a guard watching the store does not loop', async () => {
    const servers = setup({
      [`${API}/auth/refresh`]: () => new Response(null, { status: 401 }),
      [`${API}/me`]: () => new Response(null, { status: 401 }),
    });
    await servers.client.ready();
    const listener = vi.fn();
    servers.client.store.subscribe(listener);

    expect((await servers.client.fetch(`https://${API}/me`)).status).toBe(401);
    await servers.client.refresh();

    expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('sends no token to another origin and does not refresh for its 401', async () => {
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
      'bucket.example.com/upload': () => new Response(null, { status: 401 }),
    });
    await servers.client.ready();

    await servers.client.fetch('https://bucket.example.com/upload', { method: 'PUT' });

    expect(servers.callsTo('bucket.example.com/upload')[0]!.headers.has('authorization')).toBe(
      false,
    );
    expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1);
  });

  it('does not retry a request whose stream body is already spent', async () => {
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 'restored' }),
      [`${API}/upload`]: () => new Response(null, { status: 401 }),
    });
    await servers.client.ready();

    const body = new Blob(['chunk']).stream();
    const response = await servers.client.fetch(`https://${API}/upload`, {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(401);
    expect(servers.callsTo(`${API}/upload`)).toHaveLength(1);
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

  it('keeps a guarded page from sending the user to the IdP login while logging out', async () => {
    let respond = () => undefined as void;
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 't' }),
      [`${API}/auth/logout`]: () =>
        new Promise<Response>((resolve) => {
          respond = () => resolve(new Response(null, { status: 204 }));
        }),
    });
    await servers.client.ready();

    const logout = servers.client.logout({ idp: true });
    void servers.client.requireAuth();
    await vi.waitFor(() => expect(servers.callsTo(`${API}/auth/logout`)).toHaveLength(1));
    expect(servers.redirect).not.toHaveBeenCalled();

    respond();
    await logout;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(servers.redirect).toHaveBeenCalledOnce();
    expect(new URL(servers.redirect.mock.calls[0]![0]).pathname).toBe('/logout');
  });

  it('makes a login called from a store subscriber wait for the logout', async () => {
    let respond = () => undefined as void;
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 't' }),
      [`${API}/auth/logout`]: () =>
        new Promise<Response>((resolve) => {
          respond = () => resolve(new Response(null, { status: 204 }));
        }),
    });
    await servers.client.ready();
    servers.client.store.subscribe((state) => {
      if (state.status === 'unauthenticated') void servers.client.login();
    });

    const logout = servers.client.logout({ idp: true });
    await vi.waitFor(() => expect(servers.callsTo(`${API}/auth/logout`)).toHaveLength(1));
    expect(servers.redirect).not.toHaveBeenCalled();

    respond();
    await logout;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(servers.redirect).toHaveBeenCalledOnce();
    expect(new URL(servers.redirect.mock.calls[0]![0]).pathname).toBe('/logout');
  });

  it('keeps waiting for an IdP logout that a later logout finished before', async () => {
    const pending: (() => void)[] = [];
    const servers = setup({
      [`${API}/auth/refresh`]: () => Response.json({ access_token: 't' }),
      [`${API}/auth/logout`]: () =>
        pending.length === 0
          ? new Promise<Response>((resolve) => {
              pending.push(() => resolve(new Response(null, { status: 204 })));
            })
          : new Response(null, { status: 204 }),
    });
    await servers.client.ready();

    const first = servers.client.logout({ idp: true });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    await servers.client.logout();
    const login = servers.client.login();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(servers.redirect).not.toHaveBeenCalled();

    pending[0]!();
    await Promise.all([first, login]);

    expect(servers.redirect).toHaveBeenCalledOnce();
    expect(new URL(servers.redirect.mock.calls[0]![0]).pathname).toBe('/logout');
  });

  it('lets the user log in again after coming back from the IdP logout page', async () => {
    const servers = setup(routes);
    await servers.client.logout({ idp: true });
    expect(new URL(servers.redirect.mock.calls[0]![0]).pathname).toBe('/logout');

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await servers.client.login();

    expect(servers.redirect).toHaveBeenCalledTimes(2);
    expect(new URL(servers.redirect.mock.calls[1]![0]).pathname).toBe('/authorize');
  });

  it('only ends the service session when the IdP does not advertise logout', async () => {
    const servers = setup(routes);
    withoutEndSession(servers);
    await servers.client.logout({ idp: true });

    expect(servers.redirect).not.toHaveBeenCalled();
    expect(servers.client.store.getState().status).toBe('unauthenticated');
  });
});

describe('tabs sharing one refresh cookie', () => {
  afterEach(() => vi.restoreAllMocks());

  function sharedLocks(): LockManager {
    const queues = new Map<string, Promise<unknown>>();
    const request = (name: string, callback: () => Promise<unknown>) => {
      const run = (queues.get(name) ?? Promise.resolve()).then(callback);
      queues.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    };
    return { request, query: async () => ({}) } as unknown as LockManager;
  }

  it('sends the next refresh only after the previous one has rotated the cookie', async () => {
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue(sharedLocks());
    let cookie = 'R0';
    let rotations = 0;
    const presented: string[] = [];
    const deliveries: (() => void)[] = [];
    const servers = setup({
      [`${API}/auth/refresh`]: async () => {
        presented.push(cookie);
        const next = `R${++rotations}`;
        await new Promise<void>((resolve) => deliveries.push(resolve));
        cookie = next;
        return Response.json({ access_token: `access-${next}` });
      },
    });
    const tabA = servers.client;
    const tabB = servers.create();

    const restoring = Promise.all([tabA.ready(), tabB.ready()]);
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(presented).toEqual(['R0']);

    deliveries.shift()!();
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    deliveries.shift()!();
    await restoring;

    expect(presented).toEqual(['R0', 'R1']);
    expect([tabA.getAccessToken(), tabB.getAccessToken()]).toEqual(['access-R1', 'access-R2']);
  });

  it('takes the same lock when the api address differs only by a trailing slash', async () => {
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue(sharedLocks());
    const deliveries: (() => void)[] = [];
    const servers = setup({
      [`${API}/auth/refresh`]: async () => {
        await new Promise<void>((resolve) => deliveries.push(resolve));
        return Response.json({ access_token: 'restored' });
      },
    });
    const tabB = servers.create();
    const tabC = createAccountClient({
      issuer: 'production',
      clientId: 'ziggle',
      api: `https://${API}/`,
      scopes: ['name', 'email'],
      fetch: servers.fetch,
    });

    const restoring = Promise.all([tabB.ready(), tabC.ready()]);
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(servers.callsTo(`${API}/auth/refresh`)).toHaveLength(1);

    deliveries.shift()!();
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    deliveries.shift()!();
    await restoring;
  });

  it('lets the next tab refresh after one fails', async () => {
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue(sharedLocks());
    let refreshes = 0;
    const servers = setup({
      [`${API}/auth/refresh`]: () =>
        ++refreshes === 1
          ? new Response(null, { status: 503 })
          : Response.json({ access_token: 'restored' }),
    });
    const tabB = servers.create();

    await Promise.all([servers.client.ready(), tabB.ready()]);

    expect(servers.client.store.getState()).toMatchObject({ error: { code: 'server_error' } });
    expect(tabB.getAccessToken()).toBe('restored');
  });
});
