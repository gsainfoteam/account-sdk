import { describe, expect, it } from 'vitest';

import { AccountError, buildAuthorizeUrl, createAuthorization, parseCallback } from '../src';
import { metadata } from './helpers';

const base = {
  clientId: 'client-1',
  redirectUri: 'https://ziggle.gistory.me/callback?from=login',
  state: 'state-1',
  codeChallenge: 'challenge-1',
};

describe('buildAuthorizeUrl', () => {
  it('builds a PKCE code request on the login host', () => {
    const url = new URL(buildAuthorizeUrl(metadata, { ...base, scopes: ['name', 'email'] }));
    expect(url.origin + url.pathname).toBe('https://account.gistory.me/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://ziggle.gistory.me/callback?from=login',
      scope: 'name email',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
    });
  });

  it('requires a nonce for openid and sends it', () => {
    expect(() => buildAuthorizeUrl(metadata, { ...base, scopes: ['openid'] })).toThrow(
      AccountError,
    );
    const url = new URL(buildAuthorizeUrl(metadata, { ...base, scopes: ['openid'], nonce: 'n-1' }));
    expect(url.searchParams.get('nonce')).toBe('n-1');
  });

  it('drops a nonce without openid, which account-fe rejects', () => {
    const url = new URL(buildAuthorizeUrl(metadata, { ...base, scopes: ['name'], nonce: 'n-1' }));
    expect(url.searchParams.has('nonce')).toBe(false);
  });

  it('adds prompt=consent for offline_access unless login was asked', () => {
    const consent = new URL(buildAuthorizeUrl(metadata, { ...base, scopes: ['offline_access'] }));
    expect(consent.searchParams.get('prompt')).toBe('consent');
    const none = new URL(
      buildAuthorizeUrl(metadata, { ...base, scopes: ['offline_access'], prompt: 'none' }),
    );
    expect(none.searchParams.get('prompt')).toBe('consent');
    const login = new URL(
      buildAuthorizeUrl(metadata, { ...base, scopes: ['offline_access'], prompt: 'login' }),
    );
    expect(login.searchParams.get('prompt')).toBe('login');
  });

  it('leaves prompt out when nothing needs it', () => {
    const url = new URL(buildAuthorizeUrl(metadata, { ...base, scopes: ['name'] }));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('createAuthorization', () => {
  it('stores what the callback needs and only makes a nonce for openid', async () => {
    const plain = await createAuthorization(metadata, { ...base, scopes: ['name'] });
    expect(plain.transaction.nonce).toBeUndefined();
    expect(new URL(plain.url).searchParams.get('state')).toBe(plain.transaction.state);

    const oidc = await createAuthorization(metadata, { ...base, scopes: ['openid', 'name'] });
    expect(oidc.transaction.nonce).toBeTruthy();
    expect(new URL(oidc.url).searchParams.get('nonce')).toBe(oidc.transaction.nonce);
  });
});

describe('parseCallback', () => {
  const issuers = metadata.issuers;
  const callback = (query: string): string => `https://ziggle.gistory.me/callback?${query}`;

  it('returns the code when state and iss match', () => {
    expect(
      parseCallback(callback('code=c-1&state=s-1&iss=https://account.gistory.me'), {
        state: 's-1',
        issuers,
      }),
    ).toEqual({ code: 'c-1', state: 's-1' });
  });

  it('accepts a response without iss', () => {
    expect(parseCallback(callback('code=c-1&state=s-1'), { state: 's-1', issuers }).code).toBe(
      'c-1',
    );
  });

  it('fails when no state was stored', () => {
    expect(() => parseCallback(callback('code=c-1&state=s-1'), { state: null, issuers })).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
  });

  it('fails when the state differs or is missing', () => {
    expect(() =>
      parseCallback(callback('code=c-1&state=other'), { state: 's-1', issuers }),
    ).toThrow(expect.objectContaining({ code: 'state_mismatch' }));
    expect(() => parseCallback(callback('code=c-1'), { state: 's-1', issuers })).toThrow(
      expect.objectContaining({ code: 'state_mismatch' }),
    );
  });

  it('checks state before reporting an error', () => {
    expect(() =>
      parseCallback(callback('error=access_denied&state=other'), { state: 's-1', issuers }),
    ).toThrow(expect.objectContaining({ code: 'state_mismatch' }));
  });

  it('maps account-fe denial reasons to their own codes', () => {
    expect(() =>
      parseCallback(callback('error=access_denied&error_description=user_cancelled&state=s-1'), {
        state: 's-1',
        issuers,
      }),
    ).toThrow(expect.objectContaining({ code: 'user_cancelled' }));
    expect(() =>
      parseCallback(
        callback('error=access_denied&error_description=verification_required&state=s-1'),
        {
          state: 's-1',
          issuers,
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'verification_required' }));
  });

  it('rejects an iss from another issuer', () => {
    expect(() =>
      parseCallback(callback('code=c-1&state=s-1&iss=https://evil.example'), {
        state: 's-1',
        issuers,
      }),
    ).toThrow(expect.objectContaining({ code: 'issuer_mismatch' }));
  });

  it('fails without a code', () => {
    expect(() => parseCallback(callback('state=s-1'), { state: 's-1', issuers })).toThrow(
      expect.objectContaining({ code: 'missing_code' }),
    );
  });
});
