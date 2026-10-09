import {
  AccountError,
  discover,
  exchangeCode,
  fetchUserInfo,
  requestClientCredentials,
  revokeToken,
  verifyIdToken,
  type AccountMetadata,
  type ClientScope,
  type ExchangeCodeParams,
  type IdTokenClaims,
  type RevokeParams,
  type TokenResponse,
  type UserInfo,
} from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

import { createClientTokenCache } from './client-token-cache';
import { AccountServerOptionsSchema, type AccountServerOptions } from './options';

/**
 * 서비스 백엔드를 대신해 IdP 와 통신한다.
 *
 * @typeParam RequiredScope {@link AccountServerOptions.requiredScopes} 의 scope. 사용자 조회 결과에서 이 scope 의 필드가 필수가 된다.
 * @typeParam LookupScope {@link AccountServerOptions.clientCredentialsScopes} 의 scope. {@link AccountServer.getUserInfoBySub} 결과에 적용된다.
 */
export interface AccountServer<
  RequiredScope extends ClientScope = never,
  LookupScope extends ClientScope = never,
> {
  metadata(): Promise<AccountMetadata>;
  /**
   * 프론트가 로그인할 때 보낸 IdP access token 을 확인하고 그 사용자를 돌려준다.
   *
   * @throws {@link AccountError} IdP 가 토큰을 거절하면 `invalid_token`, 필수 scope 의 필드가 빠졌으면 `missing_claims`.
   */
  getUserInfo(accessToken: string): Promise<UserInfo<RequiredScope>>;
  /** 프론트가 받은 code 를 confidential client 로서 IdP 토큰으로 교환한다. */
  exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse>;
  /** {@link AccountServer.exchangeCode} 한 뒤 {@link AccountServer.getUserInfo} 까지 한다. */
  loginWithCode(
    params: ExchangeCodeParams,
  ): Promise<{ tokens: TokenResponse; user: UserInfo<RequiredScope> }>;
  /**
   * 캐시한 client credentials 토큰으로, 사용자가 없는 상황에서 사용자를 조회한다.
   *
   * @remarks
   * IdP 가 재시작하면 발급한 토큰을 잊는데, 그때 account-be 는 401 대신 500 을 돌려준다.
   * 어느 쪽이든 토큰을 새로 받고 조회를 한 번 다시 시도한다.
   */
  getUserInfoBySub(sub: string): Promise<UserInfo<LookupScope>>;
  /** 이 client 에 발급된 id_token 을 검증한다. 모바일 앱이 백엔드로 보낸 id_token 같은 것이다. */
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
}

/**
 * 서비스 백엔드용 IdP client 를 만든다.
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
 * @throws {@link AccountError} 옵션이 없거나 비어 있으면 `invalid_request`.
 */
export function createAccountServer<
  const RequiredScopes extends readonly ClientScope[] = [],
  const LookupScopes extends readonly ClientScope[] = [],
>(
  input: AccountServerOptions<RequiredScopes, LookupScopes>,
): AccountServer<RequiredScopes[number], LookupScopes[number]> {
  const parsed = AccountServerOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `createAccountServer options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const { issuer, clientId, clientSecret, requiredScopes, clientCredentialsScopes, fetch } = input;
  const client = { clientId, clientSecret };

  const metadata = (): Promise<AccountMetadata> => discover(issuer, { fetch });

  const requireSecret = (operation: string): string => {
    if (!clientSecret) {
      throw new AccountError('invalid_client', { description: `${operation} needs clientSecret` });
    }

    return clientSecret;
  };

  const requireScopes = (operation: string): LookupScopes => {
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

  const server: AccountServer<RequiredScopes[number], LookupScopes[number]> = {
    metadata,

    async getUserInfo(accessToken) {
      return fetchUserInfo<RequiredScopes[number]>(await metadata(), client, accessToken, {
        fetch,
        requiredScopes,
      });
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
        fetchUserInfo<LookupScopes[number]>(await metadata(), client, token, {
          fetch,
          sub,
          requiredScopes: requireScopes('getUserInfoBySub'),
        });

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
