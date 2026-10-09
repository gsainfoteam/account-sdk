import { type AccountMetadata } from './discovery';
import { AccountError } from './errors';
import { createPkce, randomString } from './pkce';
import { type Scope } from './scopes';

export type Prompt = 'none' | 'login' | 'consent';

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly Scope[];
  state: string;
  codeChallenge: string;
  nonce?: string;
  prompt?: Prompt;
}

// account-fe `routes/_auth-required/authorize.tsx` 의 검증 규칙을 요청을 만드는 쪽에서 맞춘다.
// - openid 가 있으면 nonce 가 필요하고, 없으면 nonce 를 보내면 거절된다.
// - offline_access 는 prompt 가 login 이나 consent 일 때만 받는다. OIDC Core 11 절의 요구다.
export function buildAuthorizeUrl(metadata: AccountMetadata, params: AuthorizeParams): string {
  const wantsIdToken = params.scopes.includes('openid');
  if (wantsIdToken && !params.nonce) {
    throw new AccountError('invalid_request', { description: 'openid scope requires a nonce' });
  }

  let prompt = params.prompt;
  if (params.scopes.includes('offline_access') && prompt !== 'login' && prompt !== 'consent') {
    prompt = 'consent';
  }

  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', [...new Set(params.scopes)].join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (wantsIdToken && params.nonce) url.searchParams.set('nonce', params.nonce);
  if (prompt) url.searchParams.set('prompt', prompt);
  return url.toString();
}

// callback 에서 검증하고 교환하는 데 필요한 값. 브라우저면 sessionStorage, 앱이면 메모리에 둔다.
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

export async function createAuthorization(
  metadata: AccountMetadata,
  params: CreateAuthorizationParams,
): Promise<{ url: string; transaction: AuthorizationTransaction }> {
  const pkce = await createPkce();
  const state = randomString(32);
  const nonce = params.scopes.includes('openid') ? randomString(32) : undefined;

  const url = buildAuthorizeUrl(metadata, {
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scopes: params.scopes,
    state,
    codeChallenge: pkce.codeChallenge,
    nonce,
    prompt: params.prompt,
  });

  return {
    url,
    transaction: {
      state,
      codeVerifier: pkce.codeVerifier,
      nonce,
      redirectUri: params.redirectUri,
      scopes: [...params.scopes],
      createdAt: Date.now(),
    },
  };
}
