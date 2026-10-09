import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from 'jose';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../internal/http';
import { parse } from '../internal/validate';

export const IdTokenClaimsSchema = z.looseObject({
  iss: z.string(),
  sub: z.string().check(z.minLength(1)),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iat: z.number(),
  nonce: z.optional(z.string()),
  auth_time: z.optional(z.number()),
  scope: z.optional(z.string()),
  name: z.optional(z.string()),
  profile: z.optional(z.nullable(z.string())),
  picture: z.optional(z.nullable(z.string())),
  email: z.optional(z.string()),
  student_id: z.optional(z.string()),
  phone_number: z.optional(z.string()),
});

export type IdTokenClaims = z.infer<typeof IdTokenClaimsSchema>;

export function parseIdTokenClaims(value: unknown): IdTokenClaims {
  return parse(IdTokenClaimsSchema, value, 'invalid_id_token', 'id_token claims');
}

// createRemoteJWKSet 이 키 캐시와 kid 교체 시 재요청 간격을 관리하므로, 호출마다 새로 만들면 그 캐시가 사라진다.
const jwksByFetch = new Map<Fetch | undefined, Map<string, JWTVerifyGetKey>>();

function jwksOf(metadata: AccountMetadata, fetch: Fetch | undefined): JWTVerifyGetKey {
  let byUri = jwksByFetch.get(fetch);
  if (!byUri) jwksByFetch.set(fetch, (byUri = new Map()));
  let jwks = byUri.get(metadata.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(metadata.jwksUri), fetch ? { [customFetch]: fetch } : {});
    byUri.set(metadata.jwksUri, jwks);
  }
  return jwks;
}

export interface VerifyIdTokenOptions {
  audience: string;
  nonce?: string;
  clockToleranceSec?: number;
  currentDate?: Date;
  fetch?: Fetch;
}

export async function verifyIdToken(
  metadata: AccountMetadata,
  token: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, jwksOf(metadata, options.fetch), {
      issuer: [...metadata.issuers],
      audience: options.audience,
      algorithms: [...metadata.idTokenSigningAlgs],
      requiredClaims: ['sub', 'iat', 'exp'],
      clockTolerance: options.clockToleranceSec ?? 60,
      currentDate: options.currentDate,
    }));
  } catch (cause) {
    throw new AccountError('invalid_id_token', { description: (cause as Error).message, cause });
  }
  const claims = parseIdTokenClaims(payload);
  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    throw new AccountError('invalid_id_token', { description: 'nonce mismatch' });
  }
  return claims;
}
