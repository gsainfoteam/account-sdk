import * as oauth from 'oauth4webapi';

import { toTokenResponse, type ClientCredentials, type TokenResponse } from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type RequestOptions } from '../http/fetch';
import { type Scope } from '../identity/scopes';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';

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
