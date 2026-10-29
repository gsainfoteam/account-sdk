import * as oauth from 'oauth4webapi';

import { type ClientCredentials } from './token-response';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type RequestOptions } from '../http/fetch';
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
  const base = httpOptions(options);
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
        [oauth.customFetch]: (url, init) =>
          fetch(url, { ...init, method: metadata.revocation.method }),
      },
    );

    await oauth.processRevocationResponse(response);
  } catch (error) {
    throw toAccountError(error);
  }
}
