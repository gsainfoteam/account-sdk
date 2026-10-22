import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { createAccountServer } from '@gsainfoteam/account-server';
import { afterEach, describe, expect, it } from 'vitest';

import { createFakeIdp } from '../src';

afterEach(() => clearDiscoveryCache());

describe('createFakeIdp', () => {
  it('makes up a user with every claim when none is given, so any requiredScopes pass', async () => {
    const idp = await createFakeIdp();
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name', 'email', 'student_id', 'phone_number', 'picture', 'profile'],
      fetch: idp.fetch,
    });
    const { body, user } = await idp.authorize({ clientId: 'c' });

    const login = await server.loginWithCode({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
      nonce: body.nonce,
    });
    expect(login.user).toMatchObject({ sub: user.sub, name: user.name, isStudentIdVerified: true });
    expect(user.email).toMatch(/@gm\.gist\.ac\.kr$/);
  });

  it('lets the server SDK log a user in from the id_token, with only the granted claims', async () => {
    const idp = await createFakeIdp();
    const server = createAccountServer({
      issuer: 'staging',
      clientId: 'c',
      clientSecret: 's',
      requiredScopes: ['name'],
      fetch: idp.fetch,
    });
    const { body } = await idp.authorize({
      clientId: 'c',
      user: { sub: 'u-1', name: '홍길동', email: 'a@gm.gist.ac.kr' },
      scopes: ['name'],
      amr: ['hwk', 'user'],
    });

    const { user, tokens } = await server.loginWithCode({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
      nonce: body.nonce,
    });

    expect(user).toEqual({ sub: 'u-1', name: '홍길동' });
    expect(tokens.idTokenClaims).toMatchObject({
      amr: ['hwk', 'user'],
      auth_time: expect.any(Number),
    });
  });

  it('exchanges a code once and checks PKCE and the client secret', async () => {
    const idp = await createFakeIdp({ clients: [{ clientId: 'c', clientSecret: 's' }] });
    const login = (clientSecret: string, codeVerifier?: string) => async () => {
      const { body } = await idp.authorize({ clientId: 'c' });
      const server = createAccountServer({
        issuer: 'production',
        clientId: 'c',
        clientSecret,
        fetch: idp.fetch,
      });
      const params = {
        code: body.code,
        codeVerifier: codeVerifier ?? body.code_verifier,
        redirectUri: body.redirect_uri,
        nonce: body.nonce,
      };
      await server.loginWithCode(params);
      return server.loginWithCode(params);
    };

    await expect(login('s')()).rejects.toMatchObject({ code: 'invalid_grant' });
    await expect(
      login('s', 'wrong-verifier-wrong-verifier-wrong-verifier')(),
    ).rejects.toMatchObject({
      code: 'invalid_grant',
    });
    await expect(login('wrong')()).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('serves the public registration and user lookups with a client token', async () => {
    const idp = await createFakeIdp({
      clients: [{ clientId: 'c', clientSecret: 's', scopes: ['name'], optionalScopes: ['email'] }],
      users: [{ sub: 'u-2', name: '김철수' }],
    });
    const server = createAccountServer({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      clientCredentialsScopes: ['name'],
      fetch: idp.fetch,
    });

    await expect(server.getUserInfoBySub('u-2')).resolves.toEqual({ sub: 'u-2', name: '김철수' });
    const registration = await idp.fetch('https://api.account.gistory.me/client/c/public');
    await expect(registration.json()).resolves.toMatchObject({
      scopes: ['name'],
      optionalScopes: ['email'],
    });
  });
});
