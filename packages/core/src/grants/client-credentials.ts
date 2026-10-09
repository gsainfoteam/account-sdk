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

/**
 * 사용자가 없는 상황에서 사용자를 조회할 수 있도록, client 자신의 access token 을 받는다.
 *
 * @param scopes client 에 등록한 scope 중에서 골라야 한다.
 */
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
      httpOptions(options),
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
