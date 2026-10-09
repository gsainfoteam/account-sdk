import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

/**
 * Options of {@link createAccountServer}.
 *
 * Values usually come from environment variables, so they are validated when the server starts
 * instead of on the first request.
 */
export const AccountServerOptionsSchema = z.object({
  /** `'production'`, `'staging'` or the API origin of a local account-be. */
  issuer: z.custom<IssuerInput>((value) => typeof value === 'string' && value.length > 0),
  clientId: nonEmpty(),
  /** Needed for {@link AccountServer.exchangeCode} and {@link AccountServer.getUserInfoBySub}. Checking IdP tokens works without it. */
  clientSecret: z.optional(nonEmpty()),
  /** Scopes for the client credentials token behind {@link AccountServer.getUserInfoBySub}. */
  clientCredentialsScopes: z.optional(z.array(ScopeSchema)),
  fetch: z.optional(z.custom<Fetch>((value) => typeof value === 'function')),
});

export type AccountServerOptions = z.input<typeof AccountServerOptionsSchema>;
export type ParsedAccountServerOptions = z.output<typeof AccountServerOptionsSchema>;
