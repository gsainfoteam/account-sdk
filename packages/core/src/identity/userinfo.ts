import {
  OPTIONAL_CLAIMS,
  SCOPE_CLAIMS,
  type ClaimsOf,
  type ClientScope,
  type UserClaims,
} from '@gsainfoteam/account-contract';
import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type IdTokenClaims } from './id-token';
import { LegacyNullClaimsShape, UserClaimsSchema } from './user-claims';
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

/** 허용된 scope 밖의 claim은 빠진다. */
export const UserInfoResponseSchema = z.looseObject({
  sub: z.string().check(z.minLength(1)),
  ...z.partial(UserClaimsSchema).shape,
  ...LegacyNullClaimsShape,
});

type BaseUserInfo = Simplify<{ sub: string } & Partial<Camel<UserClaims>>>;

export const UserInfoSchema = z.pipe(
  UserInfoResponseSchema,
  z.transform((raw): BaseUserInfo => {
    const user: { sub: string } & OrUndefined<Camel<UserClaims>> = {
      sub: raw.sub,
      name: raw.name,
      profile: raw.profile ?? undefined,
      picture: raw.picture ?? undefined,
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

/** `S`는 {@link hasScopeClaims} 같은 런타임 검사를 거친 값에만 붙는다. */
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

const optionalClaims: ReadonlySet<keyof UserClaims> = new Set(OPTIONAL_CLAIMS);

function missingClaims(user: UserInfo, scopes: readonly ClientScope[]): (keyof UserClaims)[] {
  return scopes
    .flatMap((scope) => SCOPE_CLAIMS[scope])
    .filter((claim) => !optionalClaims.has(claim) && user[CAMEL_CLAIMS[claim]] === undefined);
}

/** `user`에 `scopes`의 필수 claim이 모두 들어 있는지 알려 준다. 값이 없을 수 있는 claim(`OPTIONAL_CLAIMS`)은 보지 않는다. */
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

/** @throws {@link AccountError} `requiredScopes`의 claim이 빠져 있으면 `missing_claims`. */
export function userInfoFromIdToken<S extends ClientScope = never>(
  claims: IdTokenClaims,
  requiredScopes: readonly S[] = [],
): UserInfo<S> {
  const user = parse(UserInfoSchema, claims, 'invalid_id_token', 'id_token claims');

  return requireScopeClaims(user, requiredScopes);
}

export interface FetchUserInfoOptions<S extends ClientScope = never> extends RequestOptions {
  /** client credentials 토큰으로 조회할 사용자다. */
  sub?: string;
  requiredScopes?: readonly S[];
}

/**
 * @throws {@link AccountError} IdP가 토큰을 401이나 403으로 거절하면 `invalid_token`.
 * `requiredScopes`의 claim이 빠져 있으면 `missing_claims`.
 * 다만 지금 account-be는 모르는 토큰에 500을 돌려주므로, 이 동작이 고쳐지기 전까지 이 경우는 `server_error`로 나온다.
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
