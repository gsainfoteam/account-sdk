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

/**
 * {@link AccountServer.loginWithCode} 가 확인하는 로그인 방식. 2FA 나 최근 재인증이 필요한 작업 앞에서 쓴다.
 * 프론트는 `login({ prompt: 'login' })` 으로 사용자가 다시 로그인하게 한다.
 */
export interface AuthenticationRequirement {
  /** IdP 로그인이 이 시간(초) 안에 있었어야 한다. id_token 의 `auth_time` 으로 확인한다. */
  maxAge?: number;
  /** 로그인 방식(RFC 8176 `amr`) 중 하나 이상이 있어야 한다. 비밀번호는 `pwd`, 패스키는 `hwk` 다. */
  amr?: readonly string[];
}

/** {@link AccountServer.loginWithCode} 에 넘기는 값. 프론트가 callback 에서 받아 그대로 보낸다. */
export interface LoginWithCodeParams extends ExchangeCodeParams {
  /** authorization 요청에 보낸 nonce. id_token 을 다른 로그인에서 가져와 재사용하지 못하게 한다. */
  nonce: string;
}

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
   * 프론트가 callback 에서 받은 code 를 confidential client 로서 교환하고, id_token 의 claim 으로 사용자를 만든다.
   *
   * @remarks
   * 사용자를 이 client 가 직접 교환한 id_token 으로만 확인한다. 프론트가 보낸 IdP access token 을 믿으면, 누구나
   * 등록할 수 있는 다른 client 의 토큰으로도 로그인할 수 있게 된다. account-be 의 access token 에는 대상 client 가 없다.
   *
   * @throws {@link AccountError} code 가 이미 쓰였거나 만료됐으면 `invalid_grant`. id_token 이 없거나 nonce 가 다르면
   * `invalid_id_token`. 필수 scope 의 claim 이 빠졌으면 `missing_claims`. `requirement` 를 채우지 못하면
   * `insufficient_authentication`.
   */
  loginWithCode(
    params: LoginWithCodeParams,
    requirement?: AuthenticationRequirement,
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
  /**
   * IdP 에 등록한 client 가 이 서버의 설정과 맞는지 확인한다. 서버가 뜰 때 한 번 부른다.
   *
   * - `requiredScopes` 는 모두 필수 scope 로 등록되어 있어야 한다. 선택 scope 면 거부한 사용자가 로그인하지 못한다.
   * - `clientCredentialsScopes` 는 필수나 선택 scope 로 등록되어 있어야 한다.
   * - `clientSecret` 을 쓰면 인증 방식이 `client_secret_post` 여야 한다.
   *
   * @throws {@link AccountError} 맞지 않으면 `invalid_client`, 틀린 점은 `description` 에 있다. IdP 에 닿지 못하면 그 에러.
   */
  verifyRegistration(): Promise<void>;
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
 * const { user } = await account.loginWithCode({ code, codeVerifier, redirectUri, nonce });
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
