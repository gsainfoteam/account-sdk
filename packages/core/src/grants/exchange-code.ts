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
