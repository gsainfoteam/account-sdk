import { clearDiscoveryCache, type ClientScope } from '@gsainfoteam/account-core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { createSigner } from '../../core/tests/helpers';
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

describe('loginWithCode', async () => {
  const signer = await createSigner();
  const now = Math.floor(Date.now() / 1000);
  const login = {
    code: 'x',
    codeVerifier: 'v',
    redirectUri: 'https://app.example/cb',
    nonce: 'n-1',
  };

  const idpIssuing = (claims: Record<string, unknown>) =>
    idp({
      '/oauth/token': async ({ body }) => {
        expect(body.get('client_secret')).toBe('s');
        const idToken = await signer.sign({
          iss: 'https://api.account.gistory.me',
          aud: 'c',
          iat: now,
          exp: now + 3600,
          nonce: 'n-1',
          ...claims,
        });
        return Response.json({ ...tokenBody, scope: 'openid name email', id_token: idToken });
      },
    });

  const serverOf = <const R extends readonly ClientScope[] = []>(
    fetch: typeof globalThis.fetch,
    requiredScopes?: R,
  ) =>
    createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes,
      fetch,
    });

  it('needs a client secret', async () => {
    const server = createAccountServer({ issuer: 'production', clientId: 'c', fetch: idp({}) });
    await expect(server.loginWithCode(login)).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('reads the user from the id_token of its own exchange, without userinfo', async () => {
    const fetch = idpIssuing({ sub: 'user-1', name: '홍길동', email: 'a@gm.gist.ac.kr' });
    const { tokens, user } = await serverOf(fetch, ['name', 'email']).loginWithCode(login);

    expect(tokens.accessToken).toBe('at-1');
    expect(user).toEqual({ sub: 'user-1', name: '홍길동', email: 'a@gm.gist.ac.kr' });
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/oauth/userinfo'),
      expect.anything(),
    );
    expectTypeOf(user.name).toEqualTypeOf<string>();
    expectTypeOf(user.studentId).toEqualTypeOf<string | undefined>();
  });

  it('rejects an id_token from another login', async () => {
    const fetch = idpIssuing({ sub: 'user-1', nonce: 'n-other' });
    await expect(serverOf(fetch).loginWithCode(login)).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('fails without an id_token instead of trusting the access token', async () => {
    const fetch = idp({ '/oauth/token': () => Response.json(tokenBody) });
    await expect(serverOf(fetch).loginWithCode(login)).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('checks how recently and how the user signed in to the IdP when asked', async () => {
    const fetch = idpIssuing({ sub: 'user-1', auth_time: now - 600, amr: ['pwd'] });
    const server = serverOf(fetch);

    await expect(server.loginWithCode(login, { maxAge: 300 })).rejects.toMatchObject({
      code: 'insufficient_authentication',
    });
    await expect(server.loginWithCode(login, { amr: ['hwk'] })).rejects.toMatchObject({
      code: 'insufficient_authentication',
      description: 'the IdP login used pwd, not hwk',
    });
    await expect(
      server.loginWithCode(login, { maxAge: 900, amr: ['pwd', 'hwk'] }),
    ).resolves.toBeTruthy();
  });

  it('fails with missing_claims when a required scope was not granted', async () => {
    const fetch = idpIssuing({ sub: 'user-1', name: '홍길동' });
    await expect(
      serverOf(fetch, ['name', 'student_id']).loginWithCode(login),
    ).rejects.toMatchObject({
      code: 'missing_claims',
      description: 'student_id is_student_id_verified',
    });
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
      '/oauth/userinfo': ({ url }) =>
        Response.json({ sub: url.searchParams.get('sub'), name: 'n', email: 'e' }),
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
    expect(users.map((user) => user?.sub)).toEqual(['u-1', 'u-2', 'u-3']);
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
          : Response.json({ sub: 'u-1', name: 'n', email: 'e' }),
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

  it('leaves the claims of an optional scope the user declined empty', async () => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name'],
      clientCredentialsScopes: ['name', 'email'],
      fetch: idp({
        '/oauth/token': () => Response.json({ ...tokenBody, access_token: 'client-token' }),
        '/oauth/userinfo': () => Response.json({ sub: 'u-1', name: 'n' }),
      }),
    });

    const user = await server.getUserInfoBySub('u-1');
    expect(user).toEqual({ sub: 'u-1', name: 'n' });
    expectTypeOf<NonNullable<typeof user>['name']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<typeof user>['email']>().toEqualTypeOf<string | undefined>();
  });

  it('fails with missing_claims when a required scope is missing', async () => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name', 'email'],
      clientCredentialsScopes: ['name', 'email'],
      fetch: idp({
        '/oauth/token': () => Response.json({ ...tokenBody, access_token: 'client-token' }),
        '/oauth/userinfo': () => Response.json({ sub: 'u-1', name: 'n' }),
      }),
    });

    await expect(server.getUserInfoBySub('u-1')).rejects.toMatchObject({
      code: 'missing_claims',
      description: 'email',
    });
  });

  it.each([
    ['404', () => Response.json({ message: 'Not Found', statusCode: 404 }, { status: 404 })],
    ['400 from older IdPs', () => Response.json({ error: 'invalid_grant' }, { status: 400 })],
  ])('answers a user the IdP will not show with null (%s)', async (_, userinfo) => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      clientCredentialsScopes: ['name'],
      fetch: idp({
        '/oauth/token': () => Response.json({ ...tokenBody, access_token: 'client-token' }),
        '/oauth/userinfo': userinfo,
      }),
    });
    await expect(server.getUserInfoBySub('u-1')).resolves.toBeNull();
  });
});

describe('verifyRegistration', () => {
  const registered = (body: unknown) => idp({ '/client/c/public': () => Response.json(body) });

  it('passes when the code matches the registration', async () => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name'],
      clientCredentialsScopes: ['email'],
      fetch: registered({
        scopes: ['name'],
        optionalScopes: ['email'],
        tokenEndpointAuthMethod: 'client_secret_post',
      }),
    });

    await expect(server.verifyRegistration()).resolves.toBeUndefined();
  });

  it('lists every mismatch', async () => {
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name', 'email'],
      clientCredentialsScopes: ['student_id'],
      fetch: registered({
        scopes: ['name'],
        optionalScopes: ['email'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      }),
    });

    await expect(server.verifyRegistration()).rejects.toMatchObject({
      code: 'invalid_client',
      description:
        'requiredScopes has email, which is not a required scope of the client; ' +
        'clientCredentialsScopes has student_id, which the client does not have; ' +
        'the client authenticates with client_secret_basic, not client_secret_post',
    });
  });
});
