import * as oauth from 'oauth4webapi';
import * as z from 'zod/mini';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { type ClientCredentials } from '../grants/token-response';
import { type RequestOptions } from '../internal/http';
import {
  authorizationServer,
  httpOptions,
  oauthClient,
  toAccountError,
} from '../internal/oauth4webapi';
import { parse } from '../internal/validate';

// account-be User 모델에서 profile 과 picture 만 nullable 이다.
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
  sub?: string;
}

// 표준은 모르는 토큰에 401 이다. 지금 account-be 는 Redis 조회 실패를 그대로 흘려 500 을 돌려주므로
// 그 경우는 server_error 로 남는다. account-be 를 고치면 invalid_token 으로 들어온다.
export async function fetchUserInfo(
  metadata: AccountMetadata,
  client: Pick<ClientCredentials, 'clientId'>,
  accessToken: string,
  options: FetchUserInfoOptions = {},
): Promise<UserInfo> {
  // account-be 는 client_credentials 토큰일 때 조회할 사용자를 query 로 받는다.
  const endpoint = new URL(metadata.userinfoEndpoint);
  if (options.sub) endpoint.searchParams.set('sub', options.sub);
  const as = { ...authorizationServer(metadata), userinfo_endpoint: endpoint.toString() };
  const oauthClientOf = oauthClient(client.clientId);
  try {
    const response = await oauth.userInfoRequest(
      as,
      oauthClientOf,
      accessToken,
      httpOptions(metadata, options),
    );
    const body = await oauth.processUserInfoResponse(
      as,
      oauthClientOf,
      options.sub ?? oauth.skipSubjectCheck,
      response,
    );
    return parse(UserInfoSchema, body, 'server_error', 'userinfo response');
  } catch (error) {
    throw toAccountError(error);
  }
}
