import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

// 값은 대개 env 에서 온다. 비어 있으면 첫 요청이 아니라 서버가 뜰 때 실패하게 한다.
export const AccountServerOptionsSchema = z.object({
  issuer: z.custom<IssuerInput>((value) => typeof value === 'string' && value.length > 0),
  clientId: nonEmpty(),
  clientSecret: z.optional(nonEmpty()),
  clientCredentialsScopes: z.optional(z.array(ScopeSchema)),
  fetch: z.optional(z.custom<Fetch>((value) => typeof value === 'function')),
});

export type AccountServerOptions = z.input<typeof AccountServerOptionsSchema>;
export type ParsedAccountServerOptions = z.output<typeof AccountServerOptionsSchema>;
