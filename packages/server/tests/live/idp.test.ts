import { discover, SCOPES, type Environment } from '@gsainfoteam/account-core';
import { describe, expect, it } from 'vitest';

import { createAccountServer } from '../../src';

const environments: Environment[] = ['production', 'staging'];

describe.each(environments)('%s IdP', (environment) => {
  it('advertises exactly the scopes the SDK knows', async () => {
    const metadata = await discover(environment);
    expect(
      [...metadata.scopesSupported].sort(),
      'account-be and @gsainfoteam/account-contract disagree',
    ).toEqual([...SCOPES].sort());
  });

  it('serves JWKS and the token endpoint where the normalized metadata points', async () => {
    const metadata = await discover(environment);
    const certs = await fetch(metadata.jwksUri);
    expect(certs.ok).toBe(true);
    expect((await certs.json()) as { keys: unknown[] }).toMatchObject({ keys: expect.any(Array) });

    const token = await fetch(metadata.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'x',
        code: 'x',
        code_verifier: 'x',
      }),
    });
    expect(await token.json()).toMatchObject({ error: expect.any(String) });
  });
});

const clientId = process.env.ACCOUNT_TEST_CLIENT_ID;
const clientSecret = process.env.ACCOUNT_TEST_CLIENT_SECRET;

describe.skipIf(!clientId || !clientSecret)('staging test client', () => {
  it('gets a client credentials token and looks a user up', async () => {
    const server = createAccountServer({
      issuer: 'staging',
      clientId: clientId!,
      clientSecret,
      clientCredentialsScopes: ['name'],
    });
    await expect(
      server.getUserInfoBySub('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/invalid_token|server_error/),
    });
  });
});
