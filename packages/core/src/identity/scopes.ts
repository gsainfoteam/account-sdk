import { isString } from 'es-toolkit';
import * as z from 'zod/mini';

/**
 * Scopes that grant access to user information. Mirrors `src/oauth/types/scope.type.ts` in account-be,
 * and a test checks it against the scopes the IdP advertises.
 */
export const ClientScopeSchema = z.enum([
  'name',
  'profile',
  'picture',
  'email',
  'phone_number',
  'student_id',
]);
/** Scopes that change which tokens are issued: `openid` adds an id_token, `offline_access` a refresh token. */
export const TokenScopeSchema = z.enum(['openid', 'offline_access']);
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
