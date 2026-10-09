import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { authorizationServer, oauthClient, toAccountError } from '../internal/oauth4webapi';

/** Values taken from a validated callback URL. */
export interface CallbackParams {
  code: string;
  state: string;
  iss?: string;
}

export interface ParseCallbackOptions {
  clientId: string;
  /** The state saved when the authorization started. Without one the callback cannot be trusted. */
  state: string | null | undefined;
}

/** Reads `state` from a callback URL without validating anything, to look up its transaction. */
export function readCallbackState(url: string | URL): string | null {
  return new URL(url).searchParams.get('state');
}

/** Tells whether a URL carries an authorization response, successful or not. */
export function isCallbackUrl(url: string | URL): boolean {
  const params = new URL(url).searchParams;
  return params.has('code') || params.has('error');
}

/**
 * Validates the callback the IdP redirected to and returns its code.
 *
 * Checks `state` before anything else, so a forged redirect cannot even report an error to the app.
 * An `iss` parameter (RFC 9207) must be one of {@link AccountMetadata.issuers}.
 *
 * @throws {@link AccountError} `state_mismatch`, `issuer_mismatch`, `missing_code`,
 * or the reason account-fe gave such as `user_cancelled`.
 */
export function parseCallback(
  metadata: AccountMetadata,
  url: string | URL,
  options: ParseCallbackOptions,
): CallbackParams {
  if (!options.state) throw new AccountError('state_mismatch');

  const params = new URL(url).searchParams;
  const iss = params.get('iss') ?? undefined;
  const as = authorizationServer(metadata, iss);

  try {
    const validated = oauth.validateAuthResponse(
      as,
      oauthClient(options.clientId),
      params,
      options.state,
    );
    const code = validated.get('code');
    if (!code) throw new AccountError('missing_code');
    return { code, state: options.state, iss };
  } catch (error) {
    if (error instanceof oauth.OperationProcessingError)
      throw new AccountError('state_mismatch', { cause: error });
    throw toAccountError(error);
  }
}
