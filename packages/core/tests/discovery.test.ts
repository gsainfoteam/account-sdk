import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AccountError,
  SCOPES,
  clearDiscoveryCache,
  createLogoutUrl,
  discover,
  discoveryUrlOf,
  normalizeDiscovery,
} from '../src';
import production from './fixtures/discovery.production.json' with { type: 'json' };
import staging from './fixtures/discovery.staging.json' with { type: 'json' };

describe('discoveryUrlOf', () => {
  it('maps environments to the API host', () => {
    expect(discoveryUrlOf('production')).toBe(
      'https://api.account.gistory.me/.well-known/openid-configuration',
    );
    expect(discoveryUrlOf('staging')).toBe(
      'https://api.stg.account.gistory.me/.well-known/openid-configuration',
    );
  });

  it('takes a custom API origin', () => {
    expect(discoveryUrlOf('http://localhost:3000')).toBe(
      'http://localhost:3000/.well-known/openid-configuration',
    );
  });

  it('does not treat Object.prototype keys as environments', () => {
    expect(() => discoveryUrlOf('toString')).toThrow();
  });
});

describe('normalizeDiscovery', () => {
  it('keeps the production endpoints', () => {
    const metadata = normalizeDiscovery(production, discoveryUrlOf('production'));
    expect(metadata.authorizationEndpoint).toBe('https://account.gistory.me/authorize');
    expect(metadata.tokenEndpoint).toBe('https://api.account.gistory.me/oauth/token');
    expect(metadata.userinfoEndpoint).toBe('https://api.account.gistory.me/oauth/userinfo');
    expect(metadata.jwksUri).toBe('https://api.account.gistory.me/oauth/certs');
    expect(metadata.issuers).toEqual([
      'https://account.gistory.me',
      'https://api.account.gistory.me',
    ]);
  });

  it('rebuilds the broken staging endpoints from the host it was fetched from', () => {
    const metadata = normalizeDiscovery(staging, discoveryUrlOf('staging'));
    expect(metadata.authorizationEndpoint).toBe('https://stg.account.gistory.me/authorize');
    expect(metadata.tokenEndpoint).toBe('https://api.stg.account.gistory.me/oauth/token');
    expect(metadata.jwksUri).toBe('https://api.stg.account.gistory.me/oauth/certs');
    expect(metadata.issuers).toContain('https://stg.account.gistory.me');
    expect(metadata.issuers).toContain('https://api.stg.account.gistory.me');
  });

  it('rejects a document without endpoints', () => {
    expect(() => normalizeDiscovery({ issuer: 'x' }, discoveryUrlOf('production'))).toThrow(
      expect.objectContaining({ code: 'discovery_failed' }),
    );
  });

  it('puts the revocation endpoint on the API host', () => {
    const metadata = normalizeDiscovery(staging, discoveryUrlOf('staging'));
    expect(metadata.revocationEndpoint).toBe('https://api.stg.account.gistory.me/oauth/revoke');
  });
});

describe('end_session_endpoint', () => {
  it('points at the login host and builds a logout URL that returns with a state', () => {
    const metadata = normalizeDiscovery(
      { ...production, end_session_endpoint: 'https://account.account.gistory.me/logout' },
      discoveryUrlOf('production'),
    );
    const logout = createLogoutUrl(metadata, {
      clientId: 'c',
      postLogoutRedirectUri: 'https://app.example/auth/callback',
    });

    expect(metadata.endSessionEndpoint).toBe('https://account.gistory.me/logout');
    expect(new URL(logout!.url).searchParams.toString()).toBe(
      `client_id=c&post_logout_redirect_uri=${encodeURIComponent('https://app.example/auth/callback')}&state=${logout!.state}`,
    );
  });

  it('has no logout URL when the IdP does not advertise one', () => {
    const { end_session_endpoint: _, ...withoutLogout } = production;
    const metadata = normalizeDiscovery(withoutLogout, discoveryUrlOf('production'));
    expect(createLogoutUrl(metadata, { clientId: 'c' })).toBeNull();
  });
});

describe('scopes', () => {
  it('match what the IdP advertises', () => {
    expect([...SCOPES].sort(), 'account-be and @gsainfoteam/account-contract disagree').toEqual(
      [...production.scopes_supported].sort(),
    );
  });
});

describe('discover', () => {
  afterEach(() => clearDiscoveryCache());

  it('fetches once per issuer', async () => {
    const fetch = vi.fn(async () => Response.json(production));
    const [a, b] = await Promise.all([
      discover('production', { fetch }),
      discover('production', { fetch }),
    ]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(production));
    await expect(discover('production', { fetch })).rejects.toSatisfy((e) =>
      AccountError.is(e, 'network_error'),
    );
    await expect(discover('production', { fetch })).resolves.toMatchObject({
      issuer: 'https://account.gistory.me',
    });
  });

  it('rejects an HTML page', async () => {
    const fetch = vi.fn(
      async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
    );
    await expect(discover('https://account.gistory.me', { fetch })).rejects.toSatisfy((e) =>
      AccountError.is(e, 'discovery_failed'),
    );
  });
});
