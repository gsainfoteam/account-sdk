import * as oauth from 'oauth4webapi';

import {
  asForIdTokenOf,
  toTokenResponse,
  type ClientCredentials,
  type TokenResponse,
} from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type RequestOptions } from '../internal/http';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';

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
