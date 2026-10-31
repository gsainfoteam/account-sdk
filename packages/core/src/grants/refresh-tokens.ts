import * as oauth from 'oauth4webapi';

import { toTokenResponse, type ClientCredentials, type TokenResponse } from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type RequestOptions } from '../http/fetch';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';

/**
 * refresh token으로 새 토큰을 받는다. account-be는 refresh token을 교체하므로 새로 받은 값을 저장해야 한다.
 *
 * @throws {@link AccountError} refresh token이 없거나, 이미 쓰였거나, 만료됐으면 `invalid_grant`.
 */
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
      httpOptions(options),
    );

    const result = await oauth.processRefreshTokenResponse(
      authorizationServer(metadata),
      oauthClient(client.clientId),
      response,
    );

    return toTokenResponse(result);
  } catch (error) {
    throw toAccountError(error);
  }
}
