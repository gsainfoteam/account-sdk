import { describe, expect, it } from 'vitest';

import { createCodeChallenge, createPkce, randomString } from '../src';

describe('pkce', () => {
  // RFC 7636 Appendix B
  it('derives the S256 challenge from the RFC 7636 verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await createCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a verifier of at least 43 base64url characters', async () => {
    const pkce = await createPkce();
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pkce.codeChallengeMethod).toBe('S256');
    expect(pkce.codeChallenge).toBe(await createCodeChallenge(pkce.codeVerifier));
  });

  it('does not repeat random strings', () => {
    const values = new Set(Array.from({ length: 100 }, () => randomString()));
    expect(values.size).toBe(100);
  });
});
