import { isError } from 'es-toolkit';
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from 'jose';
import * as z from 'zod/mini';

import { ID_TOKEN_CLOCK_TOLERANCE_SEC } from '../constants';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../http/fetch';
import { parse } from '../internal/validate';

/** Claims of an id_token account-be signs. Profile claims appear only for the granted scopes. */
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
  /** The client id the token was issued to. */
  audience: string;
  /** The nonce sent in the authorization request. When given, the token must carry it. */
  nonce?: string;
  clockToleranceSec?: number;
  currentDate?: Date;
  fetch?: Fetch;
}

/**
 * Verifies an id_token that did not come straight from the token endpoint, such as one an app sends
 * to its backend: signature against the IdP's JWKS, issuer, audience, expiry and nonce.
 *
 * @remarks
 * Keys are fetched once per JWKS URI and refreshed by jose when an unknown `kid` shows up.
 *
 * @throws {@link AccountError} `invalid_id_token`.
 */
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
      clockTolerance: options.clockToleranceSec ?? ID_TOKEN_CLOCK_TOLERANCE_SEC,
      currentDate: options.currentDate,
    }));
  } catch (cause) {
    throw new AccountError('invalid_id_token', {
      description: isError(cause) ? cause.message : String(cause),
      cause,
    });
  }

  const claims = parseIdTokenClaims(payload);
  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    throw new AccountError('invalid_id_token', { description: 'nonce mismatch' });
  }

  return claims;
}
