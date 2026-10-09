import {
  ScopeSchema,
  type Fetch,
  type IssuerInput,
} from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

import { type SessionAdapter } from '../session/session-adapter';

const nonEmpty = () => z.string().check(z.minLength(1));

const method = () => z.custom<(...args: never[]) => unknown>(isFunction);

const SessionAdapterShapeSchema = z.looseObject({
  login: method(),
  refresh: method(),
  logout: method(),
});

/** Options of {@link createAccountClient}. Validated at creation, so a missing env value fails at startup. */
export const AccountClientOptionsSchema = z.object({
  /** `'production'`, `'staging'` or the `https:` API origin of another account-be deployment. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /** Callback path or URL registered for the client. A path is resolved against the current origin. */
  redirectUri: nonEmpty(),
  scopes: z.array(ScopeSchema),
  /**
   * Asks for `offline_access` too. Off by default: service backends use the IdP token only once at login,
   * and `offline_access` makes account-fe show the consent screen on every sign-in.
   */
  offlineAccess: z.optional(z.boolean()),
  /**
   * Who exchanges the authorization code.
   * - `browser`: the browser exchanges it as a public client and hands the IdP access token to the session.
   * - `backend`: the code and PKCE verifier go to the service backend, which exchanges them as a confidential client.
   */
  exchange: z.enum(['browser', 'backend']),
  /** How to start, refresh and end the service backend's session. See {@link cookieSession} and {@link bodySession}. */
  session: z.custom<SessionAdapter>((value) => SessionAdapterShapeSchema.safeParse(value).success),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
  /** Where pending authorizations are kept. Defaults to `sessionStorage`. */
  transactionStorage: z.optional(z.custom<Storage>()),
  /** Navigates to the IdP. Defaults to `location.assign`. */
  redirect: z.optional(z.custom<(url: string) => void>(isFunction)),
});

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
