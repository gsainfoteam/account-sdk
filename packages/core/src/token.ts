import { decodeJwt } from 'jose';
import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from './discovery';
import { parseIdTokenClaims, type IdTokenClaims } from './id-token';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
  type RequestOptions,
} from './oauth';
import { parseScopes, type Scope } from './scopes';

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

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce?: string;
  iss?: string;
}

// state 는 callback 을 받은 쪽(브라우저나 앱)이 이미 검증했다. 서버가 code 를 넘겨받는 B 방식에서도
// 같은 함수를 쓰도록 state 검사는 건너뛰고, oauth4webapi 가 요구하는 검증된 callback 파라미터만 만든다.
export async function exchangeCode(
  metadata: AccountMetadata,
  client: ClientCredentials,
  params: ExchangeCodeParams,
  options: RequestOptions = {},
): Promise<TokenResponse> {
  try {
    const callback = new URLSearchParams({ code: params.code });
    if (params.iss) callback.set('iss', params.iss);
    const validated = oauth.validateAuthResponse(
      authorizationServer(metadata, params.iss),
      oauthClient(client.clientId),
      callback,
      oauth.skipStateCheck,
    );

    const response = await oauth.authorizationCodeGrantRequest(
      authorizationServer(metadata),
      oauthClient(client.clientId),
      clientAuthentication(client.clientSecret),
      validated,
      params.redirectUri,
      params.codeVerifier,
      httpOptions(metadata, options),
    );
    const result = await oauth.processAuthorizationCodeResponse(
      await asForIdTokenOf(metadata, response),
      oauthClient(client.clientId),
      response,
      { expectedNonce: params.nonce ?? oauth.expectNoNonce },
    );
    return toTokenResponse(result);
  } catch (error) {
    throw toAccountError(error);
  }
}

export async function refreshTokens(
  metadata: AccountMetadata,
  client: ClientCredentials,
  refreshToken: string,
  options: RequestOptions = {},
): Promise<TokenResponse> {
  try {
    const response = await oauth.refreshTokenGrantRequest(
      authorizationServer(metadata),
      oauthClient(client.clientId),
      clientAuthentication(client.clientSecret),
      refreshToken,
      httpOptions(metadata, options),
    );
    const result = await oauth.processRefreshTokenResponse(
      await asForIdTokenOf(metadata, response),
      oauthClient(client.clientId),
      response,
    );
    return toTokenResponse(result);
  } catch (error) {
    throw toAccountError(error);
  }
}

export async function requestClientCredentials(
  metadata: AccountMetadata,
  client: Required<ClientCredentials>,
  scopes: readonly Scope[],
  options: RequestOptions = {},
): Promise<TokenResponse> {
  try {
    const response = await oauth.clientCredentialsGrantRequest(
      authorizationServer(metadata),
      oauthClient(client.clientId),
      clientAuthentication(client.clientSecret),
      { scope: scopes.join(' ') },
      httpOptions(metadata, options),
    );
    const result = await oauth.processClientCredentialsResponse(
      authorizationServer(metadata),
      oauthClient(client.clientId),
      response,
    );
    return toTokenResponse(result);
  } catch (error) {
    throw toAccountError(error);
  }
}

export interface RevokeParams {
  token: string;
  tokenTypeHint: 'access_token' | 'refresh_token';
}

export async function revokeToken(
  metadata: AccountMetadata,
  client: ClientCredentials,
  { token, tokenTypeHint }: RevokeParams,
  options: RequestOptions = {},
): Promise<void> {
  const base = httpOptions(metadata, options);
  const fetch = options.fetch ?? globalThis.fetch;
  try {
    const response = await oauth.revocationRequest(
      { ...authorizationServer(metadata), revocation_endpoint: metadata.revocation.endpoint },
      oauthClient(client.clientId),
      clientAuthentication(client.clientSecret),
      token,
      {
        ...base,
        additionalParameters: { token_type_hint: tokenTypeHint },
        // account-be 는 RFC 7009 의 POST 대신 `DELETE /oauth/token` 으로 받는다.
        [oauth.customFetch]: (url, init) =>
          fetch(url, { ...init, method: metadata.revocation.method }),
      },
    );
    await oauth.processRevocationResponse(response);
  } catch (error) {
    throw toAccountError(error);
  }
}

// id_token 의 iss 가 metadata.issuers 중 무엇인지 미리 읽어서 그 issuer 로 검증하게 한다.
// 서명은 oauth4webapi 가 확인하지 않는다. token endpoint 에서 TLS 로 직접 받은 응답이라 OIDC Core 3.1.3.7 이 허용한다.
async function asForIdTokenOf(
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

function toTokenResponse(result: oauth.TokenEndpointResponse): TokenResponse {
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
