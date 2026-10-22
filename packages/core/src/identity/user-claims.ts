import { type UserClaims } from '@gsainfoteam/account-contract';
import * as z from 'zod/mini';

/**
 * account-be 가 내주는 사용자 claim 전부. 타입은 `@gsainfoteam/account-contract` 의 `UserClaims` 와 묶여 있어서,
 * contract 에 claim 이 추가되거나 바뀌면 여기서 컴파일 에러가 난다.
 * `null` 이 될 수 있는 건 `profile` 과 `picture` 뿐이다. account-be 사용자 모델에서 nullable 인 컬럼과 같다.
 */
export const UserClaimsSchema = z.object({
  name: z.string(),
  profile: z.nullable(z.string()),
  picture: z.nullable(z.string()),
  email: z.string(),
  student_id: z.string(),
  is_student_id_verified: z.boolean(),
  phone_number: z.string(),
  is_phone_number_verified: z.boolean(),
}) satisfies z.ZodMiniType<UserClaims>;
