import { decodeJwt } from 'jose';
import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { parseIdTokenClaims, type IdTokenClaims } from '../identity/id-token';
import { parseScopes, type Scope } from '../identity/scopes';
import { authorizationServer } from '../internal/oauth4webapi';

/** Tokens the IdP token endpoint returned, with the id_token claims already validated. */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  /** Access token lifetime in seconds. */
  expiresIn: number | undefined;
  /** Present only when `offline_access` was granted. account-be rotates it on every refresh. */
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  idToken?: string;
  /** Claims of `idToken`, checked against issuer, audience, expiry and nonce. */
  idTokenClaims?: IdTokenClaims;
  scopes: Scope[];
}

/**
 * Identifies the client to the token endpoint.
 *
 * Leave `clientSecret` out for a public client (a browser or an app); set it for a confidential client
 * (a service backend). The secret is sent with `client_secret_post`.
 */
export interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
}

/**
 * Picks the issuer to validate the id_token in `response` against.
 *
 * @remarks
 * oauth4webapi compares the id_token `iss` with a single issuer. The IdP uses more than one, so the
 * claim is read first and, when it is one of {@link AccountMetadata.issuers}, used as that issuer.
 * The signature is not checked here: the response came straight from the token endpoint over TLS,
 * which OIDC Core section 3.1.3.7 allows to stand in for it.
 */
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

/** Converts an oauth4webapi token response into a {@link TokenResponse}. */
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
