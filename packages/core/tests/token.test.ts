import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  exchangeCode,
  fetchUserInfo,
  refreshTokens,
  requestClientCredentials,
  revokeToken,
} from '../src';
import { createSigner, jsonResponse, metadata } from './helpers';

const tokenBody = {
  access_token: 'at-1',
  token_type: 'Bearer',
  expires_in: 10800,
  scope: 'name email',
};

function mockFetch(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return fetch;
}

function bodyOf(fetch: ReturnType<typeof mockFetch>, call = 0): URLSearchParams {
  return new URLSearchParams(String(fetch.mock.calls[call]?.[1]?.body));
}

describe('exchangeCode', () => {
  it('posts the code with PKCE as a public client', async () => {
    const fetch = mockFetch(jsonResponse(tokenBody));
    const tokens = await exchangeCode(
      metadata,
      { clientId: 'client-1' },
      { code: 'c-1', codeVerifier: 'v-1', redirectUri: 'https://app/callback' },
      { fetch },
    );
    expect(tokens).toMatchObject({
      accessToken: 'at-1',
      expiresIn: 10800,
      scopes: ['name', 'email'],
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.account.gistory.me/oauth/token');
    expect(Object.fromEntries(bodyOf(fetch))).toMatchObject({
      grant_type: 'authorization_code',
      client_id: 'client-1',
      code: 'c-1',
      code_verifier: 'v-1',
      redirect_uri: 'https://app/callback',
    });
    expect(bodyOf(fetch).has('client_secret')).toBe(false);
  });

  it('sends the secret as a confidential client', async () => {
    const fetch = mockFetch(jsonResponse(tokenBody));
    await exchangeCode(
      metadata,
      { clientId: 'client-1', clientSecret: 's-1' },
      { code: 'c-1', codeVerifier: 'v-1', redirectUri: 'https://app/callback' },
      { fetch },
    );
    expect(bodyOf(fetch).get('client_secret')).toBe('s-1');
  });

  it('validates the id_token nonce and the issuer account-be signs with', async () => {
    const signer = await createSigner();
    const iat = Math.floor(Date.now() / 1000);
    const idToken = await signer.sign({
      iss: 'https://api.account.gistory.me',
      sub: 'user-1',
      aud: 'client-1',
      iat,
      exp: iat + 600,
      nonce: 'n-1',
    });
    const params = {
      code: 'c-1',
      codeVerifier: 'v-1',
      redirectUri: 'https://app/callback',
      nonce: 'n-1',
    };

    const ok = await exchangeCode(metadata, { clientId: 'client-1' }, params, {
      fetch: mockFetch(jsonResponse({ ...tokenBody, scope: 'openid name', id_token: idToken })),
    });
    expect(ok.idTokenClaims).toMatchObject({ sub: 'user-1' });

    await expect(
      exchangeCode(
        metadata,
        { clientId: 'client-1' },
        { ...params, nonce: 'n-2' },
        {
          fetch: mockFetch(jsonResponse({ ...tokenBody, scope: 'openid name', id_token: idToken })),
        },
      ),
    ).rejects.toMatchObject({ code: 'invalid_id_token' });
  });

  it('maps an OAuth error body', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(
      exchangeCode(
        metadata,
        { clientId: 'client-1' },
        { code: 'c-1', codeVerifier: 'v-1', redirectUri: 'x' },
        { fetch },
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant', status: 400 });
  });

  it('rejects an iss that is not the IdP', async () => {
    await expect(
      exchangeCode(
        metadata,
        { clientId: 'client-1' },
        { code: 'c-1', codeVerifier: 'v-1', redirectUri: 'x', iss: 'https://evil.example' },
        { fetch: mockFetch() },
      ),
    ).rejects.toMatchObject({ code: 'issuer_mismatch' });
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      exchangeCode(
        metadata,
        { clientId: 'client-1' },
        { code: 'c-1', codeVerifier: 'v-1', redirectUri: 'x' },
        { fetch },
      ),
    ).rejects.toMatchObject({ code: 'network_error' });
  });
});

describe('refreshTokens', () => {
  it('returns the rotated refresh token', async () => {
    const fetch = mockFetch(
      jsonResponse({ ...tokenBody, refresh_token: 'rt-2', refresh_token_expires_in: 7776000 }),
    );
    const tokens = await refreshTokens(metadata, { clientId: 'client-1' }, 'rt-1', { fetch });
    expect(tokens).toMatchObject({ refreshToken: 'rt-2', refreshTokenExpiresIn: 7776000 });
    expect(Object.fromEntries(bodyOf(fetch))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rt-1',
    });
  });
});

describe('requestClientCredentials', () => {
  it('asks for the scopes with the secret', async () => {
    const fetch = mockFetch(jsonResponse(tokenBody));
    await requestClientCredentials(
      metadata,
      { clientId: 'client-1', clientSecret: 's-1' },
      ['name', 'email'],
      {
        fetch,
      },
    );
    expect(Object.fromEntries(bodyOf(fetch))).toMatchObject({
      grant_type: 'client_credentials',
      scope: 'name email',
      client_secret: 's-1',
    });
  });
});

describe('revokeToken', () => {
  it('uses DELETE /oauth/token until the IdP has a revocation endpoint', async () => {
    const fetch = mockFetch(new Response(null, { status: 200 }));
    await revokeToken(
      metadata,
      { clientId: 'client-1' },
      { token: 'rt-1', tokenTypeHint: 'refresh_token' },
      { fetch },
    );
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.account.gistory.me/oauth/token');
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(Object.fromEntries(bodyOf(fetch))).toMatchObject({
      token: 'rt-1',
      token_type_hint: 'refresh_token',
    });
  });
});

describe('fetchUserInfo', () => {
  it('converts the snake_case body', async () => {
    const fetch = mockFetch(
      jsonResponse({
        sub: 'user-1',
        name: '홍길동',
        student_id: '20251234',
        is_student_id_verified: true,
      }),
    );
    await expect(
      fetchUserInfo(metadata, { clientId: 'client-1' }, 'at-1', { fetch }),
    ).resolves.toEqual({
      sub: 'user-1',
      name: '홍길동',
      studentId: '20251234',
      isStudentIdVerified: true,
      email: undefined,
      phoneNumber: undefined,
      isPhoneNumberVerified: undefined,
      picture: undefined,
      profile: undefined,
    });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer at-1');
  });

  it('asks for another user with a client token', async () => {
    const fetch = mockFetch(jsonResponse({ sub: 'user-2' }));
    await fetchUserInfo(metadata, { clientId: 'client-1' }, 'client-token', {
      fetch,
      sub: 'user-2',
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.account.gistory.me/oauth/userinfo?sub=user-2',
    );
  });

  it('rejects a body that does not match the account-be shape', async () => {
    const fetch = mockFetch(jsonResponse({ sub: 'user-1', is_student_id_verified: 'yes' }));
    await expect(
      fetchUserInfo(metadata, { clientId: 'client-1' }, 'at-1', { fetch }),
    ).rejects.toMatchObject({
      code: 'server_error',
      description: expect.stringContaining('is_student_id_verified'),
    });
  });

  it('types the claims of the required scopes as present once they are checked', async () => {
    const fetch = mockFetch(
      jsonResponse({
        sub: 'user-1',
        name: '홍길동',
        student_id: '20240000',
        is_student_id_verified: true,
      }),
    );
    const user = await fetchUserInfo(metadata, { clientId: 'client-1' }, 'at-1', {
      fetch,
      requiredScopes: ['name', 'student_id'],
    });

    expect(user).toMatchObject({
      name: '홍길동',
      studentId: '20240000',
      isStudentIdVerified: true,
    });
    expectTypeOf(user.name).toEqualTypeOf<string>();
    expectTypeOf(user.isStudentIdVerified).toEqualTypeOf<boolean>();
    expectTypeOf(user.email).toEqualTypeOf<string | undefined>();
  });

  it('fails with missing_claims when a required scope was not granted', async () => {
    const fetch = mockFetch(jsonResponse({ sub: 'user-1', student_id: '20240000' }));
    await expect(
      fetchUserInfo(metadata, { clientId: 'client-1' }, 'at-1', {
        fetch,
        requiredScopes: ['name', 'student_id'],
      }),
    ).rejects.toMatchObject({
      code: 'missing_claims',
      description: 'name is_student_id_verified',
    });
  });

  it('counts a null profile as present', async () => {
    const fetch = mockFetch(jsonResponse({ sub: 'user-1', profile: null }));
    const user = await fetchUserInfo(metadata, { clientId: 'client-1' }, 'at-1', {
      fetch,
      requiredScopes: ['profile'],
    });

    expect(user.profile).toBeNull();
    expectTypeOf(user.profile).toEqualTypeOf<string | null>();
  });

  it('reports an unknown token as invalid_token', async () => {
    const fetch = mockFetch(jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401));
    await expect(
      fetchUserInfo(metadata, { clientId: 'client-1' }, 'bogus', { fetch }),
    ).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('keeps the 500 account-be sends today as a server error', async () => {
    const fetch = mockFetch(
      jsonResponse({ statusCode: 500, message: 'Internal server error' }, 500),
    );
    await expect(
      fetchUserInfo(metadata, { clientId: 'client-1' }, 'bogus', { fetch }),
    ).rejects.toMatchObject({ code: 'server_error' });
  });
});
