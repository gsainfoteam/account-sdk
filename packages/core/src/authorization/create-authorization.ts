import { difference, uniq } from 'es-toolkit';
import * as oauth from 'oauth4webapi';

import { CODE_CHALLENGE_METHOD } from '../constants';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Scope } from '../identity/scopes';

/** OpenID Connect `prompt` values account-fe understands. */
export type Prompt = 'none' | 'login' | 'consent';

/**
 * Everything needed to validate the callback and exchange the code.
 *
 * Keep it where the callback can read it: `sessionStorage` in a browser, memory in an app.
 */
export interface AuthorizationTransaction {
  state: string;
  codeVerifier: string;
  nonce?: string;
  redirectUri: string;
  scopes: Scope[];
  /** Epoch milliseconds, used to drop transactions older than an authorization code can live. */
  createdAt: number;
}

export interface CreateAuthorizationParams {
  clientId: string;
  /** Absolute URL registered for the client on the IdP. */
  redirectUri: string;
  scopes: readonly Scope[];
  prompt?: Prompt;
}

/**
 * Builds the authorization URL with PKCE (`S256`), `state` and, for `openid`, a `nonce`.
 *
 * @remarks
 * Applies the rules account-fe enforces in `routes/_auth-required/authorize.tsx`, so a request
 * is never rejected after the user has already been sent away:
 * - a `nonce` is sent only with `openid`, which requires it and which is the only scope that allows it;
 * - `offline_access` gets `prompt=consent` unless `login` was asked, as OIDC Core section 11 requires;
 * - scopes the IdP does not advertise are rejected here instead of on the login page.
 *
 * @throws {@link AccountError} `invalid_scope` when a scope is not in {@link AccountMetadata.scopesSupported}.
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
  const nonce = scopes.includes('openid') ? oauth.generateRandomNonce() : undefined;

  const asksForRefreshToken = scopes.includes('offline_access');
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
