import type { ClientScope } from './scopes';

/** wire 이름(snake_case) 그대로다. */
export interface UserClaims {
  name: string;
  profile: string | null;
  picture: string | null;
  email: string;
  student_id: string;
  is_student_id_verified: boolean;
  phone_number: string;
  is_phone_number_verified: boolean;
}

/** account-be 는 이 표대로 claim 을 담고, SDK 는 이 표로 필수 scope 의 claim 이 다 왔는지 확인한다. */
export const SCOPE_CLAIMS = {
  name: ['name'],
  profile: ['profile'],
  picture: ['picture'],
  email: ['email'],
  student_id: ['student_id', 'is_student_id_verified'],
  phone_number: ['phone_number', 'is_phone_number_verified'],
} as const satisfies Record<ClientScope, readonly (keyof UserClaims)[]>;

export type ClaimsOf<S extends ClientScope> = Pick<UserClaims, (typeof SCOPE_CLAIMS)[S][number]>;
