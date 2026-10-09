import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { AccountServerOptionsSchema, createAccountServer } from '../src';

type Route = (request: {
  url: URL;
  body: URLSearchParams;
  headers: Headers;
}) => Response | Promise<Response>;

function idp(routes: Record<string, Route>) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/.well-known/openid-configuration') return Response.json(production);
    const route = routes[url.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route({
      url,
      body: new URLSearchParams(String(init?.body ?? '')),
      headers: new Headers(init?.headers),
    });
  });
}

const tokenBody = {
  access_token: 'at-1',
  token_type: 'Bearer',
  expires_in: 10800,
  scope: 'name email',
};

afterEach(() => clearDiscoveryCache());

describe('createAccountServer', () => {
  it('fails at startup when an env value is empty', () => {
    expect(() => createAccountServer({ issuer: 'production', clientId: '' })).toThrow(
      expect.objectContaining({
        code: 'invalid_request',
        description: expect.stringContaining('clientId'),
      }),
    );
    expect(() =>
      createAccountServer({ issuer: 'production', clientId: 'c', clientSecret: '' }),
    ).toThrow(expect.objectContaining({ code: 'invalid_request' }));
  });

  it('rejects a scope the IdP does not define for client credentials', () => {
    const input: unknown = {
      issuer: 'production',
      clientId: 'c',
      clientCredentialsScopes: ['nickname'],
    };
    expect(AccountServerOptionsSchema.safeParse(input).success).toBe(false);
  });
});

describe('getUserInfo', () => {
  it('checks the IdP token the frontend sent', async () => {
    const fetch = idp({
      '/oauth/userinfo': () => Response.json({ sub: 'user-1', name: '홍길동' }),
    });
    const server = createAccountServer({ issuer: 'production', clientId: 'c', fetch });
    await expect(server.getUserInfo('at-1')).resolves.toMatchObject({
      sub: 'user-1',
      name: '홍길동',
    });
  });
});

describe('exchangeCode', () => {
  it('needs a client secret', async () => {
    const server = createAccountServer({ issuer: 'production', clientId: 'c', fetch: idp({}) });
    await expect(
      server.exchangeCode({ code: 'x', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('signs in with a code in one call', async () => {
    const fetch = idp({
      '/oauth/token': ({ body }) => {
        expect(body.get('client_secret')).toBe('s');
        return Response.json(tokenBody);
      },
      '/oauth/userinfo': ({ headers }) => {
        expect(headers.get('authorization')).toBe('Bearer at-1');
        return Response.json({ sub: 'user-1', email: 'a@gm.gist.ac.kr' });
      },
    });
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      fetch,
    });
    const { tokens, user } = await server.loginWithCode({
      code: 'x',
      codeVerifier: 'v',
      redirectUri: 'r',
    });
    expect(tokens.accessToken).toBe('at-1');
    expect(user.email).toBe('a@gm.gist.ac.kr');
  });
});

describe('getUserInfoBySub', () => {
  it('needs the scopes registered for the client', async () => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      fetch: idp({}),
    });
    await expect(server.getUserInfoBySub('u-1')).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('issues one client token for concurrent lookups and reuses it', async () => {
    const tokenRequests = vi.fn(() =>
      Response.json({ ...tokenBody, access_token: 'client-token' }),
    );
    const fetch = idp({
      '/oauth/token': tokenRequests,
      '/oauth/userinfo': ({ url }) => Response.json({ sub: url.searchParams.get('sub') }),
    });
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      clientCredentialsScopes: ['name', 'email'],
      fetch,
    });

    const users = await Promise.all(
      ['u-1', 'u-2', 'u-3'].map((sub) => server.getUserInfoBySub(sub)),
    );
    expect(users.map((user) => user.sub)).toEqual(['u-1', 'u-2', 'u-3']);
    await server.getUserInfoBySub('u-4');
    expect(tokenRequests).toHaveBeenCalledTimes(1);
  });

  it('gets a new client token once when the IdP lost the old one', async () => {
    let issued = 0;
    const fetch = idp({
      '/oauth/token': () =>
        Response.json({ ...tokenBody, access_token: `client-token-${++issued}` }),
      '/oauth/userinfo': ({ headers }) =>
        headers.get('authorization') === 'Bearer client-token-1'
          ? new Response('Internal server error', { status: 500 })
          : Response.json({ sub: 'u-1' }),
    });
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      clientCredentialsScopes: ['name', 'email'],
      fetch,
    });
    await expect(server.getUserInfoBySub('u-1')).resolves.toMatchObject({ sub: 'u-1' });
    expect(issued).toBe(2);
  });
});
