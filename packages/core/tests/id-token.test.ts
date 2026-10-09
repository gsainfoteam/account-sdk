import { describe, expect, it, vi } from 'vitest';

import { base64UrlEncode, createLocalJwks, createRemoteJwks, verifyIdToken } from '../src';
import { createSigner } from './helpers';

const now = 1_800_000_000;
const claims = {
  iss: 'https://api.account.gistory.me',
  sub: 'user-1',
  aud: 'client-1',
  iat: now,
  exp: now + 3600,
  nonce: 'n-1',
  name: '홍길동',
};
const issuers = ['https://account.gistory.me', 'https://api.account.gistory.me'];

describe('verifyIdToken', async () => {
  const signer = await createSigner();
  const jwks = createLocalJwks(signer.jwks);
  const verify = (token: string, overrides = {}) =>
    verifyIdToken(token, {
      jwks,
      issuers,
      audience: 'client-1',
      nonce: 'n-1',
      now: () => now * 1000,
      ...overrides,
    });

  it('returns the claims of a valid token', async () => {
    await expect(verify(await signer.sign(claims))).resolves.toMatchObject({
      sub: 'user-1',
      name: '홍길동',
    });
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }],
    ['another audience', { aud: 'client-2' }],
    ['an expired token', { exp: now - 3600 }],
    ['a token from the future', { iat: now + 3600 }],
    ['another nonce', { nonce: 'n-2' }],
    ['a missing nonce', { nonce: undefined }],
  ])('rejects %s', async (_, override) => {
    await expect(verify(await signer.sign({ ...claims, ...override }))).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('accepts aud as an array', async () => {
    await expect(
      verify(await signer.sign({ ...claims, aud: ['client-0', 'client-1'] })),
    ).resolves.toBeTruthy();
  });

  it('rejects a token signed by another key', async () => {
    const other = await createSigner();
    await expect(verify(await other.sign(claims))).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await signer.sign(claims)).split('.');
    const forged = base64UrlEncode(
      new TextEncoder().encode(JSON.stringify({ ...claims, sub: 'admin' })),
    );
    await expect(verify(`${header}.${forged}.${signature}`)).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });

  it('rejects alg none', async () => {
    const [, payload] = (await signer.sign(claims)).split('.');
    const header = btoa(JSON.stringify({ alg: 'none' })).replace(/=+$/, '');
    await expect(verify(`${header}.${payload}.`)).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
  });
});

describe('createRemoteJwks', async () => {
  const signer = await createSigner('k-1');
  const rotated = await createSigner('k-2');

  it('fetches once and refetches when a new kid appears', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(signer.jwks))
      .mockResolvedValueOnce(Response.json(rotated.jwks));
    const jwks = createRemoteJwks('https://api.account.gistory.me/oauth/certs', {
      fetch,
      cooldownMs: 0,
    });
    const options = { jwks, issuers, audience: 'client-1', now: () => now * 1000 };

    await verifyIdToken(await signer.sign(claims), options);
    await verifyIdToken(await signer.sign(claims), options);
    expect(fetch).toHaveBeenCalledTimes(1);

    await verifyIdToken(await rotated.sign(claims), options);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not refetch for unknown kids inside the cooldown', async () => {
    const fetch = vi.fn(async () => Response.json(signer.jwks));
    const jwks = createRemoteJwks('https://api.account.gistory.me/oauth/certs', {
      fetch,
      cooldownMs: 60_000,
    });
    const options = { jwks, issuers, audience: 'client-1', now: () => now * 1000 };

    await verifyIdToken(await signer.sign(claims), options);
    await expect(verifyIdToken(await rotated.sign(claims), options)).rejects.toMatchObject({
      code: 'invalid_id_token',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
