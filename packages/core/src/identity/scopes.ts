import { isString } from 'es-toolkit';
import * as z from 'zod/mini';

/**
 * A scope-token as RFC 6749 section 3.3 defines it.
 *
 * @remarks
 * The SDK does not keep its own list of the IdP's scopes. Which scopes exist is up to the IdP, and
 * {@link createAuthorization} checks them against {@link AccountMetadata.scopesSupported} from discovery,
 * so a scope the IdP adds works without a new SDK release.
 */
export const ScopeSchema = z.string().check(z.regex(/^[\x21\x23-\x5B\x5D-\x7E]+$/));

export type Scope = z.infer<typeof ScopeSchema>;

/** OpenID Connect scope that adds an id_token, and with it a `nonce`. */
export const OPENID_SCOPE = 'openid';
/** OpenID Connect scope that adds a refresh token, and with it `prompt=consent`. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/** Parses a space-separated scope string. */
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];

  const list = isString(value) ? value.split(' ') : value;

  return list.filter((scope) => scope.length > 0);
}
