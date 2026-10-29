import { type UserClaims } from '@gsainfoteam/account-contract';
import * as z from 'zod/mini';

/**
 * 이 스키마는 `UserClaims`와 묶여 있어서, contract에 claim이 추가되거나 바뀌면 여기서 컴파일 에러가 난다.
 * nullable인 필드는 account-be 사용자 모델에서 nullable인 컬럼과 같다.
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
