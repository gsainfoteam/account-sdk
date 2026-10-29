import { attemptAsync } from 'es-toolkit';
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
  /** access token의 수명(초)이다. */
  expiresIn: number | undefined;
  /** `offline_access`가 허용됐을 때만 있다. account-be는 refresh 할 때마다 교체한다. */
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  idToken?: string;
  /** `idToken`의 claim이다. issuer, audience, 만료, nonce를 확인했다. */
  idTokenClaims?: IdTokenClaims;
  scopes: Scope[];
}

/** public client(브라우저, 앱)는 `clientSecret`을 빼고, confidential client(서비스 백엔드)는 넣는다. */
export interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
}

const WithIdTokenSchema = z.object({ id_token: z.string() });

/**
 * oauth4webapi는 id_token `iss`를 issuer 하나와만 비교한다. IdP는 issuer를 여럿 쓰므로, claim을 먼저 읽고
 * 그 값이 {@link AccountMetadata.issuers} 중 하나면 그 값을 issuer로 쓴다.
 * 서명은 확인하지 않는다. 응답이 TLS로 token endpoint에서 바로 왔고, OIDC Core 3.1.3.7절은 이것으로
 * 서명 확인을 대신할 수 있다고 한다.
 */
export async function asForIdTokenOf(
  metadata: AccountMetadata,
  response: Response,
): Promise<oauth.AuthorizationServer> {
  const idToken = await idTokenOf(response);
  if (!idToken) return authorizationServer(metadata);

  const iss = decodeJwt(idToken).iss;

  return authorizationServer(metadata, iss && metadata.issuers.includes(iss) ? iss : undefined);
}

/** 응답 body를 소비하지 않고 읽는다. */
export async function idTokenOf(response: Response): Promise<string | undefined> {
  if (!response.ok) return undefined;

  const [, body] = await attemptAsync<unknown>(() => response.clone().json());
  const parsed = WithIdTokenSchema.safeParse(body);

  return parsed.success ? parsed.data.id_token : undefined;
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
