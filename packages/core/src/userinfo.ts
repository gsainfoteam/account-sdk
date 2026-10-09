import { type AccountMetadata, type Fetch } from './discovery';
import { AccountError } from './errors';

// account-be `UserInfoResDto` 의 직렬화 결과. scope 에 없는 필드는 빠진다.
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

export interface FetchUserInfoOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
  // client_credentials 토큰으로 다른 사용자를 조회할 때 그 사용자의 sub
  sub?: string;
}

export async function fetchUserInfo(
  metadata: AccountMetadata,
  accessToken: string,
  { fetch = globalThis.fetch, signal, sub }: FetchUserInfoOptions = {},
): Promise<UserInfo> {
  const url = new URL(metadata.userinfoEndpoint);
  if (sub) url.searchParams.set('sub', sub);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal,
    });
  } catch (cause) {
    throw new AccountError('network_error', { description: `GET ${url.pathname}`, cause });
  }

  // 표준은 401 이다. 지금 account-be 는 모르는 토큰에 Redis 조회 실패를 그대로 흘려 500 을 돌려주므로,
  // 그 500 은 server_error 로 남는다. account-be 를 고치면 invalid_token 으로 들어온다.
  if (response.status === 401 || response.status === 403) {
    throw new AccountError('invalid_token', { status: response.status });
  }
  if (!response.ok) {
    throw new AccountError('server_error', {
      description: `GET ${url.pathname}`,
      status: response.status,
    });
  }
  return toUserInfo((await response.json()) as UserInfoResponse);
}
