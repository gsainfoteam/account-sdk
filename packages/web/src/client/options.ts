import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

import { type SessionAdapter } from '../session/session-adapter';

const isFunction = (value: unknown): boolean => typeof value === 'function';
const nonEmpty = () => z.string().check(z.minLength(1));

export const AccountClientOptionsSchema = z.object({
  issuer: z.custom<IssuerInput>((value) => typeof value === 'string' && value.length > 0),
  clientId: nonEmpty(),
  redirectUri: nonEmpty(),
  scopes: z.array(ScopeSchema),
  offlineAccess: z.optional(z.boolean()),
  exchange: z.enum(['browser', 'backend']),
  session: z.custom<SessionAdapter>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      ['login', 'refresh', 'logout'].every((key) =>
        isFunction((value as unknown as Record<string, unknown>)[key]),
      ),
  ),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
  transactionStorage: z.optional(z.custom<Storage>()),
  redirect: z.optional(z.custom<(url: string) => void>(isFunction)),
});

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
