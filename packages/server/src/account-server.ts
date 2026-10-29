import {
  AccountError,
  discover,
  exchangeCode,
  fetchClientRegistration,
  fetchUserInfo,
  requestClientCredentials,
  revokeToken,
  userInfoFromIdToken,
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

/** 채우지 못하면 프론트가 `login({ prompt: 'login' })` 으로 사용자를 다시 로그인하게 한다. */
export interface AuthenticationRequirement {
  /** 초 단위. */
  maxAge?: number;
  /** RFC 8176 값 중 하나 이상. 비밀번호는 `pwd`, 패스키는 `hwk` 다. */
  amr?: readonly string[];
}

export interface LoginWithCodeParams extends ExchangeCodeParams {
  /** authorization 요청에 보낸 nonce. 다른 로그인의 id_token 을 재사용하지 못하게 한다. */
  nonce: string;
}

export interface AccountServer<
  RequiredScope extends ClientScope = never,
  LookupScope extends ClientScope = never,
> {
  metadata(): Promise<AccountMetadata>;
  /**
   * 사용자는 이 client 가 직접 교환한 id_token 으로만 확인한다. account-be 의 access token 에는 대상 client 가 없어서,
   * 프론트가 보낸 access token 을 믿으면 누구나 등록할 수 있는 다른 client 의 토큰으로도 로그인할 수 있다.
   *
   * @throws {@link AccountError} code 가 이미 쓰였거나 만료됐으면 `invalid_grant`. id_token 이 없거나 nonce 가 다르면
   * `invalid_id_token`. 필수 scope 의 claim 이 빠졌으면 `missing_claims`. `requirement` 를 채우지 못하면
   * `insufficient_authentication`.
   */
  loginWithCode(
    params: LoginWithCodeParams,
    requirement?: AuthenticationRequirement,
  ): Promise<{ tokens: TokenResponse; user: UserInfo<RequiredScope> }>;
  /** IdP 가 재시작해 토큰을 잊으면 401 대신 500 을 돌려주므로, 둘 다 토큰을 새로 받아 한 번 다시 시도한다. */
  getUserInfoBySub(sub: string): Promise<UserInfo<LookupScope>>;
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
  /**
   * 서버가 뜰 때 한 번 부른다. `requiredScopes` 가 선택 scope 로 등록되어 있으면 거부한 사용자가 로그인하지 못하므로 막는다.
   *
   * @throws {@link AccountError} 맞지 않으면 `invalid_client`, 틀린 점은 `description` 에 있다.
   */
  verifyRegistration(): Promise<void>;
}

/** @throws {@link AccountError} 옵션이 없거나 비어 있으면 `invalid_request`. */
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

    async loginWithCode(params, requirement = {}) {
      requireSecret('loginWithCode');

      const tokens = await exchangeCode(await metadata(), client, params, { fetch });
      if (!tokens.idTokenClaims) {
        throw new AccountError('invalid_id_token', {
          description: 'the token response has no id_token; request the openid scope',
        });
      }

      checkAuthentication(tokens.idTokenClaims, requirement);
      const user = userInfoFromIdToken<RequiredScopes[number]>(
        tokens.idTokenClaims,
        requiredScopes,
      );

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

    async verifyRegistration() {
      const registration = await fetchClientRegistration(await metadata(), clientId, { fetch });
      const registered = [...registration.scopes, ...registration.optionalScopes];

      const problems = [
        ...(requiredScopes ?? [])
          .filter((scope) => !registration.scopes.includes(scope))
          .map(
            (scope) => `requiredScopes has ${scope}, which is not a required scope of the client`,
          ),
        ...(clientCredentialsScopes ?? [])
          .filter((scope) => !registered.includes(scope))
          .map((scope) => `clientCredentialsScopes has ${scope}, which the client does not have`),
        ...(clientSecret && registration.tokenEndpointAuthMethod !== 'client_secret_post'
          ? [
              `the client authenticates with ${registration.tokenEndpointAuthMethod ?? 'an unknown method'}, not client_secret_post`,
            ]
          : []),
      ];
      if (problems.length) {
        throw new AccountError('invalid_client', { description: problems.join('; ') });
      }
    },
  };

  return server;
}

function checkAuthentication(
  claims: IdTokenClaims,
  { maxAge, amr }: AuthenticationRequirement,
): void {
  const now = Math.floor(Date.now() / 1000);

  if (maxAge !== undefined && (claims.auth_time === undefined || now - claims.auth_time > maxAge)) {
    throw new AccountError('insufficient_authentication', {
      description: `the IdP login is older than ${maxAge} s`,
    });
  }
  if (amr && !amr.some((method) => claims.amr?.includes(method))) {
    throw new AccountError('insufficient_authentication', {
      description: `the IdP login used ${claims.amr?.join(' ') || 'an unknown method'}, not ${amr.join(' or ')}`,
    });
  }
}
