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
  type TokenResponse,
  type UserInfo,
} from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

import { createClientTokenCache } from './client-token-cache';
import { AccountServerOptionsSchema, type AccountServerOptions } from './options';

export interface AccountServer {
  metadata(): Promise<AccountMetadata>;
  getUserInfo(accessToken: string): Promise<UserInfo>;
  exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse>;
  signInWithCode(params: ExchangeCodeParams): Promise<{ tokens: TokenResponse; user: UserInfo }>;
  getUserInfoBySub(sub: string): Promise<UserInfo>;
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
}

export function createAccountServer(input: AccountServerOptions): AccountServer {
  const parsed = AccountServerOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountServer options: ${z.prettifyError(parsed.error)}`,
    });
  }
  const options = parsed.data;
  const { issuer, clientId, clientSecret, fetch } = options;
  const client = { clientId, clientSecret };
  const metadata = (): Promise<AccountMetadata> => discover(issuer, { fetch });

  const requireSecret = (operation: string): string => {
    if (!clientSecret) {
      throw new AccountError('invalid_client', { description: `${operation} needs clientSecret` });
    }
    return clientSecret;
  };

  const clientToken = createClientTokenCache(async () =>
    requestClientCredentials(
      await metadata(),
      { clientId, clientSecret: requireSecret('getUserInfoBySub') },
      options.clientCredentialsScopes ?? ['name', 'email'],
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

    async signInWithCode(params) {
      const tokens = await server.exchangeCode(params);
      const user = await server.getUserInfo(tokens.accessToken);
      return { tokens, user };
    },

    async getUserInfoBySub(sub) {
      const token = await clientToken.get();
      try {
        return await fetchUserInfo(await metadata(), client, token, { fetch, sub });
      } catch (error) {
        // IdP 가 재시작해 Redis 의 토큰이 사라졌을 수 있다. account-be 는 이때 401 대신 500 을 돌려주므로
        // 둘 다 새 토큰으로 한 번만 다시 시도한다.
        if (!AccountError.is(error, 'invalid_token') && !AccountError.is(error, 'server_error'))
          throw error;
        clientToken.invalidate();
        return fetchUserInfo(await metadata(), client, await clientToken.get(), { fetch, sub });
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
