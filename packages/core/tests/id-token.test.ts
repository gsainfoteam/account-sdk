import { describe, expect, it, vi } from 'vitest';

import { verifyIdToken } from '../src';
import { createSigner, jsonResponse, metadata } from './helpers';

const now = new Date('2027-01-15T00:00:00Z');
const iat = Math.floor(now.getTime() / 1000);
const claims = {
  iss: 'https://account.gistory.me',
  sub: 'user-1',
  aud: 'client-1',
  iat,
  exp: iat + 3600,
  nonce: 'n-1',
  name: '홍길동',
};

describe('verifyIdToken', async () => {
  const signer = await createSigner();
  const fetch = vi.fn(async () => jsonResponse(signer.jwks));
  const verify = (token: string) =>
    verifyIdToken(metadata, token, { fetch, audience: 'client-1', nonce: 'n-1', currentDate: now });

  it('returns the claims of a valid token, with keys from the jwks_uri', async () => {
    await expect(verify(await signer.sign(claims))).resolves.toMatchObject({
      sub: 'user-1',
      name: '홍길동',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.account.gistory.me/oauth/certs',
      expect.anything(),
    );
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }],
    ['the API host as issuer', { iss: 'https://api.account.gistory.me' }],
    ['another audience', { aud: 'client-2' }],
    ['an expired token', { exp: iat - 3600 }],
    ['another nonce', { nonce: 'n-2' }],
    ['a missing nonce', { nonce: undefined }],
  ])('rejects %s', async (_, override) => {
    await expect(verify(await signer.sign({ ...claims, ...override }))).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('rejects a token signed by another key', async () => {
    const other = await createSigner();
    await expect(verify(await other.sign(claims))).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });
});
