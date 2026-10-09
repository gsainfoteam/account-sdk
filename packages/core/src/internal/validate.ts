import * as z from 'zod/mini';

import { AccountError, type AccountErrorCode } from '../errors/account-error';

/** `value` 를 `schema` 로 파싱한다. 맞지 않으면 `code` 를 가진 {@link AccountError} 를 던진다. */
export function parse<T>(
  schema: z.ZodMiniType<T>,
  value: unknown,
  code: AccountErrorCode,
  subject: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AccountError(code, {
    description: `${subject}: ${z.prettifyError(result.error)}`,
    cause: result.error,
  });
}
