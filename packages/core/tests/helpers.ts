import {
  base64UrlEncode,
  discoveryUrlOf,
  normalizeDiscovery,
  type AccountMetadata,
  type Jwk,
} from '../src';
import production from './fixtures/discovery.production.json' with { type: 'json' };

export const metadata: AccountMetadata = normalizeDiscovery(
  production,
  discoveryUrlOf('production'),
);

export interface TestSigner {
  jwks: { keys: Jwk[] };
  sign(claims: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

// account-be 의 키처럼 ES256 키를 만들어 JWKS 와 서명 함수를 돌려준다.
export async function createSigner(kid = 'test-key'): Promise<TestSigner> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = (await crypto.subtle.exportKey('jwk', publicKey)) as Jwk;
  delete jwk.key_ops;
  delete jwk.ext;
  const encode = (value: unknown): string =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));

  return {
    jwks: { keys: [{ ...jwk, kid, use: 'sig', alg: 'ES256' }] },
    async sign(claims, header = {}) {
      const input = `${encode({ alg: 'ES256', typ: 'JWT', kid, ...header })}.${encode(claims)}`;
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(input),
      );
      return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
    },
  };
}
