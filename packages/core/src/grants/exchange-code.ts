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
  /** The PKCE verifier from the {@link AuthorizationTransaction}. */
  codeVerifier: string;
  /** Must equal the `redirect_uri` of the authorization request. */
  redirectUri: string;
  /** The nonce sent with `openid`. The id_token must carry the same value. */
  nonce?: string;
  /** The `iss` from the callback, when the party that received it passes it along. */
  iss?: string;
}

/**
 * Exchanges an authorization code for tokens.
 *
 * Works for a public client in the browser and for a confidential client on a server that received
 * the code from its frontend.
 *
 * @remarks
 * `state` is not checked here: the party that received the callback already did, with {@link parseCallback}.
 * That is what lets a server reuse this function for codes handed over by its frontend.
 *
 * @throws {@link AccountError} `invalid_grant` for a used or expired code, `invalid_id_token`,
 * `issuer_mismatch` or `network_error`.
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
