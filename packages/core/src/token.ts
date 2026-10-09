import { type AccountMetadata, type Fetch } from './discovery';
import { AccountError, fromOAuthError } from './errors';
import { parseScopes, type Scope } from './scopes';

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  idToken?: string;
  scopes: Scope[];
}

interface RawTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  id_token?: unknown;
  scope?: unknown;
}

export function parseTokenResponse(raw: RawTokenResponse): TokenResponse {
  if (typeof raw.access_token !== 'string') {
    throw new AccountError('invalid_grant', { description: 'token response has no access_token' });
  }
  return {
    accessToken: raw.access_token,
    tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
    expiresIn: typeof raw.expires_in === 'number' ? raw.expires_in : 0,
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
    refreshTokenExpiresIn:
      typeof raw.refresh_token_expires_in === 'number' ? raw.refresh_token_expires_in : undefined,
    idToken: typeof raw.id_token === 'string' ? raw.id_token : undefined,
    scopes: parseScopes(typeof raw.scope === 'string' ? raw.scope : undefined),
  };
}

// client_secret 이 있으면 confidential client, 없으면 public client 다.
export interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
}

export interface TokenRequestOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}

export type TokenGrant =
  | { grantType: 'authorization_code'; code: string; codeVerifier: string; redirectUri: string }
  | { grantType: 'refresh_token'; refreshToken: string }
  | { grantType: 'client_credentials'; scopes: readonly Scope[] };

// client_secret_basic 대신 client_secret_post 를 쓴다. account-be 의 Basic 파서는 RFC 6749 2.3.1 의
// form-urlencoding 을 풀지 않아서, secret 에 `:` 나 `%` 가 들어가면 두 방식의 결과가 달라진다.
export async function requestToken(
  metadata: AccountMetadata,
  client: ClientCredentials,
  grant: TokenGrant,
  { fetch = globalThis.fetch, signal }: TokenRequestOptions = {},
): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: grant.grantType, client_id: client.clientId });
  if (client.clientSecret) body.set('client_secret', client.clientSecret);

  switch (grant.grantType) {
    case 'authorization_code':
      body.set('code', grant.code);
      body.set('code_verifier', grant.codeVerifier);
      body.set('redirect_uri', grant.redirectUri);
      break;
    case 'refresh_token':
      body.set('refresh_token', grant.refreshToken);
      break;
    case 'client_credentials':
      body.set('scope', grant.scopes.join(' '));
      break;
  }

  const json = await postForm(metadata.tokenEndpoint, body, { fetch, signal });
  return parseTokenResponse(json as RawTokenResponse);
}

export interface RevokeParams {
  token: string;
  tokenTypeHint: 'access_token' | 'refresh_token';
}

export async function revokeToken(
  metadata: AccountMetadata,
  client: ClientCredentials,
  { token, tokenTypeHint }: RevokeParams,
  { fetch = globalThis.fetch, signal }: TokenRequestOptions = {},
): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: client.clientId,
  });
  if (client.clientSecret) body.set('client_secret', client.clientSecret);
  await postForm(metadata.revocation.endpoint, body, { fetch, signal }, metadata.revocation.method);
}

async function postForm(
  url: string,
  body: URLSearchParams,
  { fetch = globalThis.fetch, signal }: TokenRequestOptions,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal,
    });
  } catch (cause) {
    throw new AccountError('network_error', { description: `${method} ${url}`, cause });
  }

  const text = await response.text();
  const json: unknown = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const error = (json as { error?: unknown } | undefined)?.error;
    const description = (json as { error_description?: unknown } | undefined)?.error_description;
    if (typeof error === 'string') {
      throw fromOAuthError(
        error,
        typeof description === 'string' ? description : null,
        response.status,
      );
    }
    throw new AccountError(response.status >= 500 ? 'server_error' : 'invalid_request', {
      description: `${method} ${url}`,
      status: response.status,
    });
  }
  return json;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
