import {
  SCOPE_CLAIMS,
  type ClaimsOf,
  type ClientScope,
  type UserClaims,
} from '@gsainfoteam/account-contract';
import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type IdTokenClaims } from './id-token';
import { UserClaimsSchema } from './user-claims';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type ClientCredentials } from '../grants/token-response';
import { type RequestOptions } from '../http/fetch';
import { type Camel, type CamelCase, type OrUndefined, type Simplify } from '../internal/case';
import {
  authorizationServer,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';
import { parse } from '../internal/validate';

/** account-be 가 돌려주는 userinfo body. 허용된 scope 밖의 claim 은 빠진다. */
export const UserInfoResponseSchema = z.looseObject({
  sub: z.string().check(z.minLength(1)),
  ...z.partial(UserClaimsSchema).shape,
});

type BaseUserInfo = Simplify<{ sub: string } & Partial<Camel<UserClaims>>>;

/** {@link UserInfoResponseSchema} 를 camelCase 로 바꾼 것. */
export const UserInfoSchema = z.pipe(
  UserInfoResponseSchema,
  z.transform((raw): BaseUserInfo => {
    const user: { sub: string } & OrUndefined<Camel<UserClaims>> = {
      sub: raw.sub,
      name: raw.name,
      profile: raw.profile,
      picture: raw.picture,
      email: raw.email,
      studentId: raw.student_id,
      isStudentIdVerified: raw.is_student_id_verified,
      phoneNumber: raw.phone_number,
      isPhoneNumberVerified: raw.is_phone_number_verified,
    };

    return user;
  }),
);

export type UserInfoResponse = z.input<typeof UserInfoSchema>;

/**
 * userinfo 로 조회한 사용자.
 *
 * `S` 로 준 scope 의 필드는 반드시 들어 있는 타입이 되고, 나머지 필드는 optional 이다.
 * `S` 는 {@link hasScopeClaims} 같은 런타임 검사를 거친 값에만 붙는다.
 */
export type UserInfo<S extends ClientScope = never> = Simplify<BaseUserInfo & Camel<ClaimsOf<S>>>;

const CAMEL_CLAIMS = {
  name: 'name',
  profile: 'profile',
  picture: 'picture',
  email: 'email',
  student_id: 'studentId',
  is_student_id_verified: 'isStudentIdVerified',
  phone_number: 'phoneNumber',
  is_phone_number_verified: 'isPhoneNumberVerified',
} as const satisfies { [K in keyof UserClaims]: CamelCase<K> };

function missingClaims(user: UserInfo, scopes: readonly ClientScope[]): (keyof UserClaims)[] {
  return scopes
    .flatMap((scope) => SCOPE_CLAIMS[scope])
    .filter((claim) => user[CAMEL_CLAIMS[claim]] === undefined);
}

/** `user` 에 `scopes` 의 claim 이 모두 들어 있는지 알려 준다. `null` 은 들어 있는 것으로 본다. */
export function hasScopeClaims<S extends ClientScope>(
  user: UserInfo,
  scopes: readonly S[],
): user is UserInfo<S> {
  return missingClaims(user, scopes).length === 0;
}

function requireScopeClaims<S extends ClientScope>(
  user: UserInfo,
  scopes: readonly S[],
): UserInfo<S> {
  if (hasScopeClaims(user, scopes)) return user;

  throw new AccountError('missing_claims', {
    description: missingClaims(user, scopes).join(' '),
  });
}

/**
 * 검증한 id_token 의 claim 으로 사용자를 만든다. id_token 에는 userinfo 와 같은 claim 이 들어 있다.
 *
 * @throws {@link AccountError} `requiredScopes` 의 claim 이 빠져 있으면 `missing_claims`.
 */
export function userInfoFromIdToken<S extends ClientScope = never>(
  claims: IdTokenClaims,
  requiredScopes: readonly S[] = [],
): UserInfo<S> {
  const user = parse(UserInfoSchema, claims, 'invalid_id_token', 'id_token claims');

  return requireScopeClaims(user, requiredScopes);
}

export interface FetchUserInfoOptions<S extends ClientScope = never> extends RequestOptions {
  /** client credentials 토큰으로 조회할 사용자. account-be 는 query string 에서 읽는다. */
  sub?: string;
  /** claim 이 반드시 들어 있어야 하는 scope. 하나라도 빠지면 `missing_claims` 로 실패한다. */
  requiredScopes?: readonly S[];
}

/**
 * access token 의 주인을 조회한다.
 *
 * @throws {@link AccountError} IdP 가 토큰을 401 이나 403 으로 거절하면 `invalid_token`.
 * `requiredScopes` 의 claim 이 빠져 있으면 `missing_claims`.
 *
 * @remarks
 * 지금 account-be 는 모르는 토큰에 500 을 돌려준다. Redis 조회 실패가 그대로 새어 나가기 때문이다.
 * 그래서 account-be 가 고쳐지기 전까지 이 경우는 `server_error` 로 나온다.
 */
export async function fetchUserInfo<S extends ClientScope = never>(
  metadata: AccountMetadata,
  client: Pick<ClientCredentials, 'clientId'>,
  accessToken: string,
  options: FetchUserInfoOptions<S> = {},
): Promise<UserInfo<S>> {
  const endpoint = new URL(metadata.userinfoEndpoint);
  if (options.sub) endpoint.searchParams.set('sub', options.sub);

  const as = { ...authorizationServer(metadata), userinfo_endpoint: endpoint.toString() };

  try {
    const response = await oauth.userInfoRequest(
      as,
      oauthClient(client.clientId),
      accessToken,
      httpOptions(options),
    );

    const body = await oauth.processUserInfoResponse(
      as,
      oauthClient(client.clientId),
      options.sub ?? oauth.skipSubjectCheck,
      response,
    );

    const user = parse(UserInfoSchema, body, 'server_error', 'userinfo response');

    return requireScopeClaims(user, options.requiredScopes ?? []);
  } catch (error) {
    throw toAccountError(error);
  }
}
