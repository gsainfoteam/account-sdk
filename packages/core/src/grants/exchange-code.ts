import * as oauth from 'oauth4webapi';

import {
  asForIdTokenOf,
  toTokenResponse,
  type ClientCredentials,
  type TokenResponse,
} from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
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
  /** {@link AuthorizationTransaction} 에 저장한 PKCE verifier. */
  codeVerifier: string;
  /** authorization 요청의 `redirect_uri` 와 같아야 한다. */
  redirectUri: string;
  /** `openid` 와 함께 보낸 nonce. id_token 에 같은 값이 있어야 한다. */
  nonce?: string;
  /** callback 의 `iss`. callback 을 받은 쪽이 넘겨줄 때만 있다. */
  iss?: string;
}

/**
 * authorization code 를 토큰으로 교환한다.
 *
 * 브라우저의 public client 와, 프론트에서 code 를 넘겨받은 서버의 confidential client 모두에서 쓴다.
 *
 * @remarks
 * 여기서는 `state` 를 확인하지 않는다. callback 을 받은 쪽이 이미 {@link parseCallback} 으로 확인했다.
 * 그래서 서버가 프론트에서 넘겨받은 code 에도 이 함수를 그대로 쓸 수 있다.
 *
 * @throws {@link AccountError} 이미 쓰였거나 만료된 code 면 `invalid_grant`. 그 밖에 `invalid_id_token`,
 * `issuer_mismatch`, `network_error`.
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
