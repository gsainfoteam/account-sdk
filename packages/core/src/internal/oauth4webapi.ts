import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError, fromOAuthError } from '../errors/account-error';
import { isAuthFailure } from '../http/bearer';
import { type RequestOptions } from '../http/fetch';

/**
 * Describes the IdP to oauth4webapi.
 *
 * @remarks
 * oauth4webapi accepts a single issuer. While the IdP uses more than one, a given `issuer` is first
 * checked against {@link AccountMetadata.issuers} and then used, so the library validation still runs.
 */
export function authorizationServer(
  metadata: AccountMetadata,
  issuer?: string,
): oauth.AuthorizationServer {
  if (issuer !== undefined && !metadata.issuers.includes(issuer)) {
    throw new AccountError('issuer_mismatch', { description: issuer });
  }
  return {
    issuer: issuer ?? metadata.issuer,
    authorization_endpoint: metadata.authorizationEndpoint,
    token_endpoint: metadata.tokenEndpoint,
    userinfo_endpoint: metadata.userinfoEndpoint,
    jwks_uri: metadata.jwksUri,
    scopes_supported: [...metadata.scopesSupported],
    id_token_signing_alg_values_supported: [...metadata.idTokenSigningAlgs],
  };
}

export function oauthClient(clientId: string): oauth.Client {
  return { client_id: clientId };
}

export function clientAuthentication(clientSecret: string | undefined): oauth.ClientAuth {
  return clientSecret ? oauth.ClientSecretPost(clientSecret) : oauth.None();
}

/** HTTP options for oauth4webapi. Plain `http:` is allowed only for an account-be running locally. */
export function httpOptions<Method, Body = undefined>(
  metadata: AccountMetadata,
  { fetch, signal }: RequestOptions,
): oauth.HttpRequestOptions<Method, Body> {
  return {
    signal,
    ...(fetch
      ? {
          [oauth.customFetch]: (url: string, init: oauth.CustomFetchOptions<Method, Body>) =>
            fetch(url, init as RequestInit),
        }
      : {}),
    [oauth.allowInsecureRequests]: new URL(metadata.tokenEndpoint).protocol === 'http:',
  };
}

/**
 * Maps any error thrown while talking to the IdP to an {@link AccountError}.
 *
 * @remarks
 * A failed `fetch` is a `TypeError`, but so are oauth4webapi's argument errors; those carry a code
 * starting with `ERR_` and are not reported as network errors.
 */
export function toAccountError(error: unknown): AccountError {
  if (AccountError.is(error)) return error;
  if (error instanceof oauth.AuthorizationResponseError) {
    return fromOAuthError(error.error, error.error_description);
  }
  if (error instanceof oauth.ResponseBodyError) {
    return fromOAuthError(error.error, error.error_description, error.status);
  }
  if (error instanceof oauth.WWWAuthenticateChallengeError) {
    return new AccountError('invalid_token', { status: error.response.status, cause: error });
  }
  if (error instanceof oauth.OperationProcessingError) {
    const status = error.cause instanceof Response ? error.cause.status : undefined;
    if (isAuthFailure(status)) return new AccountError('invalid_token', { status, cause: error });
    if (error.code === oauth.JWT_CLAIM_COMPARISON || error.code === oauth.JWT_TIMESTAMP_CHECK) {
      return new AccountError('invalid_id_token', { description: error.message, cause: error });
    }
    return new AccountError(status && status >= 500 ? 'server_error' : 'unknown', {
      description: error.message,
      status,
      cause: error,
    });
  }
  if (
    error instanceof TypeError &&
    !String((error as { code?: unknown }).code ?? '').startsWith('ERR_')
  ) {
    return new AccountError('network_error', { description: error.message, cause: error });
  }
  return new AccountError('unknown', { cause: error });
}
