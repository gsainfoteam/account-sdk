import * as oauth from 'oauth4webapi';

import { type RequestOptions } from './http';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError, fromOAuthError } from '../errors/account-error';

// oauth4webapi 는 issuer 를 하나만 받는다. IdP 가 issuer 를 두 가지로 내보내는 동안에는, 받은 값이
// metadata.issuers 에 있는지 먼저 확인하고 그 값을 issuer 로 넣어 라이브러리 검증을 그대로 통과시킨다.
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
    // 로컬에서 띄운 account-be(http://localhost:3000)에 붙을 때만 http 를 허용한다.
    [oauth.allowInsecureRequests]: new URL(metadata.tokenEndpoint).protocol === 'http:',
  };
}

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
    if (status === 401 || status === 403)
      return new AccountError('invalid_token', { status, cause: error });
    if (error.code === oauth.JWT_CLAIM_COMPARISON || error.code === oauth.JWT_TIMESTAMP_CHECK) {
      return new AccountError('invalid_id_token', { description: error.message, cause: error });
    }
    return new AccountError(status && status >= 500 ? 'server_error' : 'unknown', {
      description: error.message,
      status,
      cause: error,
    });
  }
  // fetch 실패도 TypeError 지만, oauth4webapi 가 잘못된 인자에 던지는 TypeError 에는 ERR_ 로 시작하는 code 가 있다.
  if (
    error instanceof TypeError &&
    !String((error as { code?: unknown }).code ?? '').startsWith('ERR_')
  ) {
    return new AccountError('network_error', { description: error.message, cause: error });
  }
  return new AccountError('unknown', { cause: error });
}
