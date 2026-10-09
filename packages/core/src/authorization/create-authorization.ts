import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Scope } from '../identity/scopes';

export type Prompt = 'none' | 'login' | 'consent';

export interface AuthorizationTransaction {
  state: string;
  codeVerifier: string;
  nonce?: string;
  redirectUri: string;
  scopes: Scope[];
  createdAt: number;
}

export interface CreateAuthorizationParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly Scope[];
  prompt?: Prompt;
}

// account-fe `routes/_auth-required/authorize.tsx` 의 검증 규칙을 요청을 만드는 쪽에서 맞춘다.
// - openid 가 있으면 nonce 가 필요하고, 없으면 nonce 를 보내면 거절된다.
// - offline_access 는 prompt 가 login 이나 consent 일 때만 받는다. OIDC Core 11 절의 요구다.
export async function createAuthorization(
  metadata: AccountMetadata,
  params: CreateAuthorizationParams,
): Promise<{ url: string; transaction: AuthorizationTransaction }> {
  const scopes = [...new Set(params.scopes)];
  // 지원하지 않는 scope 는 account-fe 화면까지 가서야 거절되므로, IdP 가 광고한 목록과 미리 대조한다.
  const unsupported = metadata.scopesSupported.length
    ? scopes.filter((scope) => !metadata.scopesSupported.includes(scope))
    : [];
  if (unsupported.length) {
    throw new AccountError('invalid_scope', { description: unsupported.join(' ') });
  }
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const nonce = scopes.includes('openid') ? oauth.generateRandomNonce() : undefined;

  let prompt = params.prompt;
  if (scopes.includes('offline_access') && prompt !== 'login' && prompt !== 'consent') {
    prompt = 'consent';
  }

  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
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
