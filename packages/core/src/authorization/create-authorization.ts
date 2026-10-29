import { difference, uniq } from 'es-toolkit';
import * as oauth from 'oauth4webapi';

import { CODE_CHALLENGE_METHOD } from '../constants';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { OFFLINE_ACCESS_SCOPE, OPENID_SCOPE, type Scope } from '../identity/scopes';

export type Prompt = 'none' | 'login' | 'consent';

/** callback 에서 읽을 수 있는 곳에 둔다. 브라우저라면 `sessionStorage`, 앱이라면 메모리다. */
export interface AuthorizationTransaction {
  state: string;
  codeVerifier: string;
  nonce?: string;
  redirectUri: string;
  scopes: Scope[];
  /** epoch 밀리초. authorization code 수명보다 오래된 트랜잭션을 버리는 데 쓴다. */
  createdAt: number;
}

export interface CreateAuthorizationParams {
  clientId: string;
  /** IdP 에 이 client 의 redirect URI 로 등록한 절대 URL. */
  redirectUri: string;
  scopes: readonly Scope[];
  prompt?: Prompt;
}

/**
 * account-fe 가 강제하는 규칙을 미리 적용한다. 사용자를 보낸 뒤에야 요청이 거절되는 일이 없게 하기 위해서다.
 * `offline_access` 에는 `login` 을 요청하지 않은 한 `prompt=consent` 를 붙인다(OIDC Core 11절).
 *
 * @throws {@link AccountError} scope 가 {@link AccountMetadata.scopesSupported} 에 없으면 `invalid_scope`.
 */
export async function createAuthorization(
  metadata: AccountMetadata,
  params: CreateAuthorizationParams,
): Promise<{ url: string; transaction: AuthorizationTransaction }> {
  const scopes = uniq(params.scopes);
  const unsupported = metadata.scopesSupported.length
    ? difference<string>(scopes, metadata.scopesSupported)
    : [];
  if (unsupported.length) {
    throw new AccountError('invalid_scope', { description: unsupported.join(' ') });
  }

  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const nonce = scopes.includes(OPENID_SCOPE) ? oauth.generateRandomNonce() : undefined;

  const asksForRefreshToken = scopes.includes(OFFLINE_ACCESS_SCOPE);
  const prompt =
    asksForRefreshToken && params.prompt !== 'login' && params.prompt !== 'consent'
      ? 'consent'
      : params.prompt;

  const url = new URL(metadata.authorizationEndpoint);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', CODE_CHALLENGE_METHOD);

  if (nonce) url.searchParams.set('nonce', nonce);
  if (prompt) url.searchParams.set('prompt', prompt);

  return {
    url: url.toString(),
    transaction: {
      state,
      codeVerifier,
      nonce,
      redirectUri: params.redirectUri,
      scopes,
      createdAt: Date.now(),
    },
  };
}
