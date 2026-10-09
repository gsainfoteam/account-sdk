import {
  AccountError,
  discover,
  exchangeCode,
  fetchUserInfo,
  requestClientCredentials,
  revokeToken,
  verifyIdToken,
  type AccountMetadata,
  type ExchangeCodeParams,
  type IdTokenClaims,
  type RevokeParams,
  type Scope,
  type TokenResponse,
  type UserInfo,
} from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

import { createClientTokenCache } from './client-token-cache';
import { AccountServerOptionsSchema, type AccountServerOptions } from './options';

/** Talks to the IdP on behalf of a service backend. */
export interface AccountServer {
  metadata(): Promise<AccountMetadata>;
  /**
   * Checks an IdP access token a frontend sent at login and returns its user.
   *
   * @throws {@link AccountError} `invalid_token` when the IdP rejects the token.
   */
  getUserInfo(accessToken: string): Promise<UserInfo>;
  /** Exchanges a code the frontend received for IdP tokens, as a confidential client. */
  exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse>;
  /** {@link AccountServer.exchangeCode} followed by {@link AccountServer.getUserInfo}. */
  loginWithCode(params: ExchangeCodeParams): Promise<{ tokens: TokenResponse; user: UserInfo }>;
  /**
   * Looks a user up while they are not present, with a cached client credentials token.
   *
   * @remarks
   * When the IdP restarts it forgets its tokens, and account-be then answers 500 instead of 401.
   * Either way the token is replaced and the lookup retried once.
   */
  getUserInfoBySub(sub: string): Promise<UserInfo>;
  /** Verifies an id_token issued to this client, such as one a mobile app sends to its backend. */
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
}

/**
 * Creates the IdP client for a service backend.
 *
 * @example
 * ```ts
 * const account = createAccountServer({
 *   issuer: 'production',
 *   clientId: process.env.ACCOUNT_CLIENT_ID!,
 *   clientSecret: process.env.ACCOUNT_CLIENT_SECRET,
 * });
 * const user = await account.getUserInfo(idpAccessToken);
 * ```
 *
 * @throws {@link AccountError} `invalid_request` when an option is missing or empty.
 */
export function createAccountServer(input: AccountServerOptions): AccountServer {
  const parsed = AccountServerOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountServer options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const options = parsed.data;
  const { issuer, clientId, clientSecret, clientCredentialsScopes, fetch } = options;
  const client = { clientId, clientSecret };

  const metadata = (): Promise<AccountMetadata> => discover(issuer, { fetch });

  const requireSecret = (operation: string): string => {
    if (!clientSecret) {
      throw new AccountError('invalid_client', { description: `${operation} needs clientSecret` });
    }

    return clientSecret;
  };

  const requireScopes = (operation: string): Scope[] => {
    if (!clientCredentialsScopes?.length) {
      throw new AccountError('invalid_request', {
        description: `${operation} needs clientCredentialsScopes`,
      });
    }

    return clientCredentialsScopes;
  };

  const clientToken = createClientTokenCache(async () =>
    requestClientCredentials(
      await metadata(),
      { clientId, clientSecret: requireSecret('getUserInfoBySub') },
      requireScopes('getUserInfoBySub'),
      { fetch },
    ),
  );

  const server: AccountServer = {
    metadata,

    async getUserInfo(accessToken) {
      return fetchUserInfo(await metadata(), client, accessToken, { fetch });
    },

    async exchangeCode(params) {
      requireSecret('exchangeCode');

      return exchangeCode(await metadata(), client, params, { fetch });
    },

    async loginWithCode(params) {
      const tokens = await server.exchangeCode(params);
      const user = await server.getUserInfo(tokens.accessToken);

      return { tokens, user };
    },

    async getUserInfoBySub(sub) {
      const lookup = async (token: string) =>
        fetchUserInfo(await metadata(), client, token, { fetch, sub });

      try {
        return await lookup(await clientToken.get());
      } catch (error) {
        const tokenLost =
          AccountError.is(error, 'invalid_token') || AccountError.is(error, 'server_error');
        if (!tokenLost) throw error;

        clientToken.invalidate();
        return lookup(await clientToken.get());
      }
    },

    async verifyIdToken(idToken, verifyOptions = {}) {
      return verifyIdToken(await metadata(), idToken, {
        fetch,
        audience: clientId,
        nonce: verifyOptions.nonce,
      });
    },

    async revoke(params) {
      return revokeToken(await metadata(), client, params, { fetch });
    },
  };

  return server;
}
