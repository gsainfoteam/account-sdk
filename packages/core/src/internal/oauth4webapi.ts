import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError, fromOAuthError } from '../errors/account-error';
import { isAuthFailure } from '../http/bearer';
import { type RequestOptions } from '../http/fetch';

const ArgumentErrorSchema = z.object({ code: z.string().check(z.startsWith('ERR_')) });

/** callback의 `iss`가 다르면 oauth4webapi보다 먼저 `issuer_mismatch`로 실패시킨다. */
export function authorizationServer(
  metadata: AccountMetadata,
  issuer?: string,
): oauth.AuthorizationServer {
  if (issuer !== undefined && issuer !== metadata.issuer) {
    throw new AccountError('issuer_mismatch', { description: issuer });
  }

  return {
    issuer: metadata.issuer,
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

/** `https:` endpoint만 허용한다. */
export function httpOptions<Method extends string, Body extends BodyInit | undefined = undefined>({
  fetch,
  signal,
}: RequestOptions): oauth.HttpRequestOptions<Method, Body> {
  return {
    signal,
    ...(fetch
      ? {
          [oauth.customFetch]: (url: string, init: oauth.CustomFetchOptions<Method, Body>) =>
            fetch(url, init),
        }
      : {}),
  };
}

/**
 * 실패한 `fetch`는 `TypeError`를 던지는데, oauth4webapi의 인자 에러도 `TypeError`다. 인자 에러에는 `ERR_`로 시작하는
 * code가 있으므로 네트워크 에러로 보고하지 않는다.
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

  if (error instanceof TypeError && !ArgumentErrorSchema.safeParse(error).success) {
    return new AccountError('network_error', { description: error.message, cause: error });
  }

  return new AccountError('unknown', { cause: error });
}
