import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

import { type AccountMetadata, type Fetch } from './discovery';
import { AccountError } from './errors';

export interface IdTokenClaims extends JWTPayload {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  auth_time?: number;
  scope?: string;
  name?: string;
  profile?: string | null;
  picture?: string | null;
  email?: string;
  student_id?: string;
  phone_number?: string;
}

export type JwksSource = JWTVerifyGetKey;

export interface RemoteJwksOptions {
  fetch?: Fetch;
}

export function createRemoteJwks(
  metadata: AccountMetadata,
  options: RemoteJwksOptions = {},
): JwksSource {
  return createRemoteJWKSet(
    new URL(metadata.jwksUri),
    options.fetch ? { [customFetch]: options.fetch } : {},
  );
}

export interface VerifyIdTokenOptions {
  jwks: JwksSource;
  audience: string;
  nonce?: string;
  clockToleranceSec?: number;
  currentDate?: Date;
}

export async function verifyIdToken(
  metadata: AccountMetadata,
  token: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, options.jwks, {
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
  if (options.nonce !== undefined && payload.nonce !== options.nonce) {
    throw new AccountError('invalid_id_token', { description: 'nonce mismatch' });
  }
  return payload as IdTokenClaims;
}
