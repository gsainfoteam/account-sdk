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

/** 로그인이 이 조건을 채우지 못하면 프론트가 `login({ prompt: 'login' })`으로 사용자를 다시 로그인하게 한다. */
export interface AuthenticationRequirement {
  /** 초 단위다. */
  maxAge?: number;
  /** RFC 8176에 정의된 값을 하나 이상 넣는다. 비밀번호는 `pwd`, 패스키는 `hwk`다. */
  amr?: readonly string[];
}

export interface LoginWithCodeParams extends ExchangeCodeParams {
  /** authorization 요청에 보낸 nonce다. 이 값은 다른 로그인의 id_token을 재사용하지 못하게 한다. */
  nonce: string;
}

export interface AccountServer<
  RequiredScope extends ClientScope = never,
  LookupScope extends ClientScope = never,
> {
  metadata(): Promise<AccountMetadata>;
  /**
   * 사용자는 이 client가 직접 교환한 id_token으로만 확인한다. account-be의 access token에는 대상 client가 적혀 있지
   * 않아서, 프론트가 보낸 access token을 믿으면 누구나 등록할 수 있는 다른 client의 토큰으로도 로그인할 수 있다.
   *
   * @throws {@link AccountError} code가 이미 쓰였거나 만료됐으면 `invalid_grant`. id_token이 없거나 nonce가 다르면
   * `invalid_id_token`. 필수 scope의 claim이 빠졌으면 `missing_claims`. `requirement`를 채우지 못하면
   * `insufficient_authentication`.
   */
  loginWithCode(
    params: LoginWithCodeParams,
    requirement?: AuthenticationRequirement,
  ): Promise<{ tokens: TokenResponse; user: UserInfo<RequiredScope> }>;
  /**
   * IdP가 재시작해 기존 토큰이 무효가 되면 401 대신 500을 돌려주므로, 두 응답 모두 토큰을 새로 받아 한 번 다시
   * 시도한다.
   *
   * 이 client에 동의하지 않았거나 없는 사용자면 `null`이다. IdP는 둘을 구분해 주지 않는다.
   *
   * 사용자가 선택 scope를 거절했을 수 있어서, `requiredScopes`에도 있는 scope의 필드만 반드시 채워진다.
   *
   * @throws {@link AccountError} `requiredScopes`에도 있는 scope의 claim이 빠졌으면 `missing_claims`.
   */
  getUserInfoBySub(sub: string): Promise<UserInfo<Extract<LookupScope, RequiredScope>> | null>;
  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims>;
  revoke(params: RevokeParams): Promise<void>;
  /**
   * 서버가 시작될 때 한 번 부른다. `requiredScopes`가 선택 scope로 등록되어 있으면 그 scope를 거부한 사용자가
   * 로그인하지 못하므로, 이런 등록을 막는다.
   *
   * @throws {@link AccountError} 등록이 맞지 않으면 `invalid_client`로 실패하고, 틀린 점은 `description`에 있다.
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
      const guaranteed = requireScopes('getUserInfoBySub').filter(
        (scope): scope is Extract<LookupScopes[number], RequiredScopes[number]> =>
          requiredScopes?.some((required) => required === scope) ?? false,
      );

      const lookup = async (token: string) =>
        fetchUserInfo(await metadata(), client, token, {
          fetch,
          sub,
          requiredScopes: guaranteed,
        }).catch((error: unknown) => {
          // account-be answers a user who never consented, or does not exist, with 404.
          // Older account-be answered the same case with 400 invalid_grant, its only 400 on userinfo.
          // The status is all there is to check: oauth4webapi does not read the body of a failed userinfo response.
          // shortcut: drop the 400 once gsainfoteam/account-be#237 is deployed to production.
          if (AccountError.is(error) && (error.status === 404 || error.status === 400)) return null;
          throw error;
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
