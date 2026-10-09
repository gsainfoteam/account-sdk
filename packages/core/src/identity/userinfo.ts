import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type ClientCredentials } from '../grants/token-response';
import { type RequestOptions } from '../http/fetch';
import {
  authorizationServer,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';
import { parse } from '../internal/validate';

/**
 * account-be 가 돌려주는 userinfo body. 허용된 scope 밖의 필드는 빠진다.
 * `null` 이 될 수 있는 건 `profile` 과 `picture` 뿐이다. account-be 사용자 모델에서 nullable 인 컬럼과 같다.
 */
export const UserInfoResponseSchema = z.looseObject({
  sub: z.string().check(z.minLength(1)),
  name: z.optional(z.string()),
  profile: z.optional(z.nullable(z.string())),
  picture: z.optional(z.nullable(z.string())),
  email: z.optional(z.string()),
  student_id: z.optional(z.string()),
  is_student_id_verified: z.optional(z.boolean()),
  phone_number: z.optional(z.string()),
  is_phone_number_verified: z.optional(z.boolean()),
});

/** {@link UserInfoResponseSchema} 를 camelCase 로 바꾼 것. */
export const UserInfoSchema = z.pipe(
  UserInfoResponseSchema,
  z.transform((raw) => ({
    sub: raw.sub,
    name: raw.name,
    profile: raw.profile,
    picture: raw.picture,
    email: raw.email,
    studentId: raw.student_id,
    isStudentIdVerified: raw.is_student_id_verified,
    phoneNumber: raw.phone_number,
    isPhoneNumberVerified: raw.is_phone_number_verified,
  })),
);

export type UserInfoResponse = z.input<typeof UserInfoSchema>;
export type UserInfo = z.output<typeof UserInfoSchema>;

export interface FetchUserInfoOptions extends RequestOptions {
  /** client credentials 토큰으로 조회할 사용자. account-be 는 query string 에서 읽는다. */
  sub?: string;
}

/**
 * access token 의 주인을 조회한다.
 *
 * @throws {@link AccountError} IdP 가 토큰을 401 이나 403 으로 거절하면 `invalid_token`.
 *
 * @remarks
 * 지금 account-be 는 모르는 토큰에 500 을 돌려준다. Redis 조회 실패가 그대로 새어 나가기 때문이다.
 * 그래서 account-be 가 고쳐지기 전까지 이 경우는 `server_error` 로 나온다.
 */
export async function fetchUserInfo(
  metadata: AccountMetadata,
  client: Pick<ClientCredentials, 'clientId'>,
  accessToken: string,
  options: FetchUserInfoOptions = {},
): Promise<UserInfo> {
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

    return parse(UserInfoSchema, body, 'server_error', 'userinfo response');
  } catch (error) {
    throw toAccountError(error);
  }
}
