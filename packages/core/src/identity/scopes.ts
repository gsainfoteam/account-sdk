import { isString } from 'es-toolkit';
import * as z from 'zod/mini';

import { ClientScopeSchema } from './client-scopes.generated';

export { ClientScopeSchema };

/** OpenID Connect scope that adds an id_token, and with it a `nonce`. */
export const OPENID_SCOPE = 'openid';
/** OpenID Connect scope that adds a refresh token, and with it `prompt=consent`. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/** Scopes that change which tokens are issued. */
export const TokenScopeSchema = z.enum([OPENID_SCOPE, OFFLINE_ACCESS_SCOPE]);
export const ScopeSchema = z.union([ClientScopeSchema, TokenScopeSchema]);
/** Every scope the SDK knows. */
export const SCOPES: readonly Scope[] = [...ClientScopeSchema.options, ...TokenScopeSchema.options];

export type ClientScope = z.infer<typeof ClientScopeSchema>;
export type TokenScope = z.infer<typeof TokenScopeSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export function isScope(value: unknown): value is Scope {
  return ScopeSchema.safeParse(value).success;
}

/** Parses a space-separated scope string, dropping values the SDK does not know instead of failing. */
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];

  const list = isString(value) ? value.split(' ') : value;

  return list.filter(isScope);
}
