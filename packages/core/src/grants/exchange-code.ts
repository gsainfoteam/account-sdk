import * as oauth from 'oauth4webapi';

import {
  asForIdTokenOf,
  idTokenOf,
  toTokenResponse,
  type ClientCredentials,
  type TokenResponse,
} from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type RequestOptions } from '../http/fetch';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  /** authorization 요청의 `redirect_uri`와 같아야 한다. */
  redirectUri: string;
  /** `openid`와 함께 보낸 nonce다. id_token에 같은 값이 있어야 한다. */
  nonce?: string;
  iss?: string;
}

/**
 * `state`는 확인하지 않는다. callback을 받은 쪽이 이미 {@link parseCallback}으로 확인했어야 한다.
 *
 * @throws {@link AccountError} 이미 쓰였거나 만료된 code면 `invalid_grant`. `nonce`를 줬는데 id_token이 없거나
 * 맞지 않으면 `invalid_id_token`. 그 밖에 `issuer_mismatch`, `network_error`.
 */
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
      httpOptions(options),
    );

    if (params.nonce !== undefined && response.ok && !(await idTokenOf(response))) {
      throw new AccountError('invalid_id_token', {
        description: 'the token response has no id_token for the openid request',
      });
    }

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
