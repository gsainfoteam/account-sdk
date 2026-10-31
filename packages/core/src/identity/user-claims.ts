import { type UserClaims } from '@gsainfoteam/account-contract';
import * as z from 'zod/mini';

import { type Equals } from '../internal/case';

export const UserClaimsSchema = z.object({
  name: z.string(),
  profile: z.optional(z.string()),
  picture: z.optional(z.string()),
  email: z.string(),
  student_id: z.string(),
  is_student_id_verified: z.boolean(),
  phone_number: z.string(),
  is_phone_number_verified: z.boolean(),
});

// contract와 어긋나면 여기서 컴파일 에러가 난다.
true satisfies Equals<z.output<typeof UserClaimsSchema>, UserClaims>;

/** account-be v2.5.0은 값이 없는 claim을 `null`로 보낸다. */
export const LegacyNullClaimsShape = {
  profile: z.nullish(z.string()),
  picture: z.nullish(z.string()),
};
