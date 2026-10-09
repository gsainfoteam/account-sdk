import * as oauth from 'oauth4webapi';

import { type ClientCredentials } from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type RequestOptions } from '../internal/http';
import {
  authorizationServer,
  clientAuthentication,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';

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
