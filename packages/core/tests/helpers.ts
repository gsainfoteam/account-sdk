import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';

import { discoveryUrlOf, normalizeDiscovery, type AccountMetadata } from '../src';
import production from './fixtures/discovery.production.json' with { type: 'json' };

export const metadata: AccountMetadata = normalizeDiscovery(
  production,
  discoveryUrlOf('production'),
);

export interface TestSigner {
  jwks: { keys: JWK[] };
  sign(claims: JWTPayload): Promise<string>;
}

export async function createSigner(kid = 'test-key'): Promise<TestSigner> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'ES256' };
  return {
    jwks: { keys: [jwk] },
    sign: (claims) =>
      new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid }).sign(privateKey),
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
