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

// 키 캐시, kid 가 바뀔 때 다시 받기, 재요청 간격 제한은 jose 가 맡는다.
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
  // authorize 요청에 보낸 nonce. 넘기면 반드시 일치해야 한다.
  nonce?: string;
  clockToleranceSec?: number;
  currentDate?: Date;
}

// token endpoint 를 거치지 않고 손에 들어온 id_token(앱이 서버로 넘긴 토큰 등)을 검증한다.
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
