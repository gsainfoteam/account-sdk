import {
  AccountError,
  discover,
  exchangeCode,
  fetchUserInfo,
  ScopeSchema,
  requestClientCredentials,
  revokeToken,
  verifyIdToken,
  type AccountMetadata,
  type ExchangeCodeParams,
  type Fetch,
  type IdTokenClaims,
  type IssuerInput,
  type RevokeParams,
  type TokenResponse,
  type UserInfo,
} from '@gsainfoteam/account-core';
import { Mutex } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

// 값은 대개 env 에서 온다. 비어 있으면 첫 요청이 아니라 서버가 뜰 때 실패하게 한다.
export const AccountServerOptionsSchema = z.object({
  issuer: z.custom<IssuerInput>((value) => typeof value === 'string' && value.length > 0),
  clientId: nonEmpty(),
  clientSecret: z.optional(nonEmpty()),
  clientCredentialsScopes: z.optional(z.array(ScopeSchema)),
  fetch: z.optional(z.custom<Fetch>((value) => typeof value === 'function')),
});

export type AccountServerOptions = z.input<typeof AccountServerOptionsSchema>;

export interface AccountServer {
  metadata(): Promise<AccountMetadata>;
  getUserInfo(accessToken: string): Promise<UserInfo>;
  exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse>;
  signInWithCode(params: ExchangeCodeParams): Promise<{ tokens: TokenResponse; user: UserInfo }>;
  getUserInfoBySub(sub: string): Promise<UserInfo>;
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
}

const CLIENT_TOKEN_REFRESH_MARGIN_MS = 60_000;

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

  let clientToken: { value: string; expiresAt: number } | undefined;
  const clientTokenMutex = new Mutex();

  const requireSecret = (operation: string): string => {
    if (!clientSecret) {
      throw new AccountError('invalid_client', { description: `${operation} needs clientSecret` });
    }
    return clientSecret;
  };

  const getClientToken = async (): Promise<string> => {
    await clientTokenMutex.acquire();
    try {
      if (clientToken && clientToken.expiresAt - CLIENT_TOKEN_REFRESH_MARGIN_MS > Date.now()) {
        return clientToken.value;
      }
      const tokens = await requestClientCredentials(
        await metadata(),
        { clientId, clientSecret: requireSecret('getUserInfoBySub') },
        options.clientCredentialsScopes ?? ['name', 'email'],
        { fetch },
      );
      clientToken = {
        value: tokens.accessToken,
        expiresAt: Date.now() + (tokens.expiresIn ?? 0) * 1000,
      };
      return clientToken.value;
    } finally {
      clientTokenMutex.release();
    }
  };

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
      const token = await getClientToken();
      try {
        return await fetchUserInfo(await metadata(), client, token, { fetch, sub });
      } catch (error) {
        // IdP 가 재시작해 Redis 의 토큰이 사라졌을 수 있다. account-be 는 이때 401 대신 500 을 돌려주므로
        // 둘 다 새 토큰으로 한 번만 다시 시도한다.
        if (!AccountError.is(error, 'invalid_token') && !AccountError.is(error, 'server_error'))
          throw error;
        clientToken = undefined;
        return fetchUserInfo(await metadata(), client, await getClientToken(), { fetch, sub });
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
