import * as z from 'zod/mini';

import { AccountError, type AccountErrorCode } from '../errors/account-error';

/** Parses `value` with `schema`, throwing an {@link AccountError} with `code` when it does not match. */
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
