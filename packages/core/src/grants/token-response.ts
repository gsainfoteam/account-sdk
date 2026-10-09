import { decodeJwt } from 'jose';
import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { parseIdTokenClaims, type IdTokenClaims } from '../identity/id-token';
import { parseScopes, type Scope } from '../identity/scopes';
import { authorizationServer } from '../internal/oauth4webapi';

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number | undefined;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  idToken?: string;
  idTokenClaims?: IdTokenClaims;
  scopes: Scope[];
}

export interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
}

// id_token 의 iss 가 metadata.issuers 중 무엇인지 미리 읽어서 그 issuer 로 검증하게 한다.
// 서명은 oauth4webapi 가 확인하지 않는다. token endpoint 에서 TLS 로 직접 받은 응답이라 OIDC Core 3.1.3.7 이 허용한다.
export async function asForIdTokenOf(
  metadata: AccountMetadata,
  response: Response,
): Promise<oauth.AuthorizationServer> {
  if (!response.ok) return authorizationServer(metadata);
  const body = (await response
    .clone()
    .json()
    .catch(() => undefined)) as { id_token?: unknown } | undefined;
  if (typeof body?.id_token !== 'string') return authorizationServer(metadata);
  const iss = decodeJwt(body.id_token).iss;
  return authorizationServer(metadata, iss && metadata.issuers.includes(iss) ? iss : undefined);
}

export function toTokenResponse(result: oauth.TokenEndpointResponse): TokenResponse {
  const claims = oauth.getValidatedIdTokenClaims(result);
  const refreshTokenExpiresIn = z.optional(z.number()).safeParse(result.refresh_token_expires_in);
  return {
    accessToken: result.access_token,
    tokenType: result.token_type,
    expiresIn: result.expires_in,
    refreshToken: result.refresh_token,
    refreshTokenExpiresIn: refreshTokenExpiresIn.success ? refreshTokenExpiresIn.data : undefined,
    idToken: result.id_token,
    idTokenClaims: claims ? parseIdTokenClaims(claims) : undefined,
    scopes: parseScopes(result.scope),
  };
}
