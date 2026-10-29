import { isError } from 'es-toolkit';
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from 'jose';
import * as z from 'zod/mini';

import { ID_TOKEN_CLOCK_TOLERANCE_SEC } from '../constants';
import { UserClaimsSchema } from './user-claims';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../http/fetch';
import { parse } from '../internal/validate';

/**
 * 사용자 claim 중에서는 허용된 scope의 claim만 들어 있다.
 * `auth_time`과 `amr`은 그 기록이 생기기 전의 세션에는 없다.
 */
export const IdTokenClaimsSchema = z.looseObject({
  iss: z.string(),
  sub: z.string().check(z.minLength(1)),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iat: z.number(),
  nonce: z.optional(z.string()),
  auth_time: z.optional(z.number()),
  amr: z.optional(z.array(z.string())),
  scope: z.optional(z.string()),
  ...z.partial(UserClaimsSchema).shape,
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
  audience: string;
  nonce?: string;
  clockToleranceSec?: number;
  currentDate?: Date;
  fetch?: Fetch;
}

/**
 * 앱이 백엔드로 보낸 것처럼, token endpoint에서 바로 오지 않은 id_token을 서명까지 검증한다.
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
