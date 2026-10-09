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
 * The userinfo body account-be returns. Fields outside the granted scopes are left out.
 * Only `profile` and `picture` can be `null`, matching the nullable columns of the account-be user model.
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

/** {@link UserInfoResponseSchema} converted to camelCase. */
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
  /** The user to look up with a client credentials token. account-be reads it from the query string. */
  sub?: string;
}

/**
 * Fetches the user behind an access token.
 *
 * @throws {@link AccountError} `invalid_token` when the IdP rejects the token with 401 or 403.
 *
 * @remarks
 * account-be currently answers an unknown token with 500 because a Redis lookup failure escapes,
 * so that case surfaces as `server_error` until account-be is fixed.
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
  const oauthClientOf = oauthClient(client.clientId);
  try {
    const response = await oauth.userInfoRequest(
      as,
      oauthClientOf,
      accessToken,
      httpOptions(options),
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
