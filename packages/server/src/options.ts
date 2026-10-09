import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

/**
 * Options of {@link createAccountServer}.
 *
 * Values usually come from environment variables, so they are validated when the server starts
 * instead of on the first request.
 */
export const AccountServerOptionsSchema = z.object({
  /** `'production'`, `'staging'` or the `https:` API origin of another account-be deployment. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /** Needed for {@link AccountServer.exchangeCode} and {@link AccountServer.getUserInfoBySub}. Checking IdP tokens works without it. */
  clientSecret: z.optional(nonEmpty()),
  /**
   * Scopes for the client credentials token behind {@link AccountServer.getUserInfoBySub}.
   * Must be among the scopes registered for the client, so there is no default.
   */
  clientCredentialsScopes: z.optional(z.array(ScopeSchema)),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
});

export type AccountServerOptions = z.input<typeof AccountServerOptionsSchema>;
