import { describe, expect, it } from 'vitest';

import { createAuthorization, parseCallback } from '../src';
import { metadata } from './helpers';

const base = { clientId: 'client-1', redirectUri: 'https://ziggle.gistory.me/callback?from=login' };

describe('createAuthorization', () => {
  it('builds a PKCE code request on the login host', async () => {
    const { url, transaction } = await createAuthorization(metadata, {
      ...base,
      scopes: ['name', 'email'],
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://account.gistory.me/authorize');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://ziggle.gistory.me/callback?from=login',
      scope: 'name email',
      state: transaction.state,
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: 'S256',
    });
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it('sends a nonce only for openid, which account-fe requires', async () => {
    const plain = await createAuthorization(metadata, { ...base, scopes: ['name'] });
    expect(new URL(plain.url).searchParams.has('nonce')).toBe(false);
    expect(plain.transaction.nonce).toBeUndefined();

    const oidc = await createAuthorization(metadata, { ...base, scopes: ['openid', 'name'] });
    expect(new URL(oidc.url).searchParams.get('nonce')).toBe(oidc.transaction.nonce);
  });

  it('adds prompt=consent for offline_access unless login was asked', async () => {
    const promptOf = async (prompt?: 'none' | 'login' | 'consent') =>
      new URL(
        (await createAuthorization(metadata, { ...base, scopes: ['offline_access'], prompt })).url,
      ).searchParams.get('prompt');
    expect(await promptOf()).toBe('consent');
    expect(await promptOf('none')).toBe('consent');
    expect(await promptOf('login')).toBe('login');
  });

  it('rejects a scope the IdP does not advertise', async () => {
    const narrowed = { ...metadata, scopesSupported: ['name', 'email'] };
    await expect(
      createAuthorization(narrowed, { ...base, scopes: ['name', 'student_id'] }),
    ).rejects.toMatchObject({
      code: 'invalid_scope',
      description: 'student_id',
    });
  });

  it('leaves prompt out when nothing needs it', async () => {
    const { url } = await createAuthorization(metadata, { ...base, scopes: ['name'] });
    expect(new URL(url).searchParams.has('prompt')).toBe(false);
  });
});

describe('parseCallback', () => {
  const callback = (query: string): string => `https://ziggle.gistory.me/callback?${query}`;
  const parse = (query: string, state: string | null = 's-1') =>
    parseCallback(metadata, callback(query), { clientId: 'client-1', state });

  it('returns the code when state and iss match', () => {
    expect(parse('code=c-1&state=s-1&iss=https://account.gistory.me')).toEqual({
      code: 'c-1',
      state: 's-1',
      iss: 'https://account.gistory.me',
    });
  });

  it('accepts a response without iss', () => {
    expect(parse('code=c-1&state=s-1').code).toBe('c-1');
  });

  it('fails when no state was stored', () => {
    expect(() => parse('code=c-1&state=s-1', null)).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
  });

  it('fails when the state differs or is missing', () => {
    expect(() => parse('code=c-1&state=other')).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
    expect(() => parse('code=c-1')).toThrow(expect.objectContaining({ code: 'state_mismatch' }));
  });

  it('checks state before reporting an error', () => {
    expect(() => parse('error=access_denied&state=other')).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
  });

  it('maps account-fe denial reasons to their own codes', () => {
    expect(() => parse('error=access_denied&error_description=user_cancelled&state=s-1')).toThrow(
      expect.objectContaining({ code: 'user_cancelled' }),
    );
    expect(() =>
      parse('error=access_denied&error_description=verification_required&state=s-1'),
    ).toThrow(expect.objectContaining({ code: 'verification_required' }));
  });

  it('reads the OIDC prompt=none errors as their own codes', () => {
    expect(() => parse('error=login_required&state=s-1')).toThrow(
      expect.objectContaining({ code: 'login_required' }),
    );
    expect(() => parse('error=interaction_required&state=s-1')).toThrow(
      expect.objectContaining({ code: 'interaction_required' }),
    );
  });

  it('rejects an iss from another issuer', () => {
    expect(() => parse('code=c-1&state=s-1&iss=https://evil.example')).toThrow(
      expect.objectContaining({ code: 'issuer_mismatch' }),
    );
  });
});
