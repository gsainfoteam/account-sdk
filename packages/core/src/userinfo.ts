import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from './discovery';
import {
  authorizationServer,
  httpOptions,
  oauthClient,
  toAccountError,
  type RequestOptions,
} from './oauth';
import { type ClientCredentials } from './token';

export interface UserInfoResponse {
  sub: string;
  name?: string;
  profile?: string | null;
  picture?: string | null;
  email?: string;
  student_id?: string;
  is_student_id_verified?: boolean;
  phone_number?: string;
  is_phone_number_verified?: boolean;
}

export interface UserInfo {
  sub: string;
  name?: string;
  profile?: string | null;
  picture?: string | null;
  email?: string;
  studentId?: string;
  isStudentIdVerified?: boolean;
  phoneNumber?: string;
  isPhoneNumberVerified?: boolean;
}

export function toUserInfo(raw: UserInfoResponse): UserInfo {
  return {
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
}

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
    return toUserInfo(body as unknown as UserInfoResponse);
  } catch (error) {
    throw toAccountError(error);
  }
}
