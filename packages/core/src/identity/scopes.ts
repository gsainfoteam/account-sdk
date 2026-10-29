import {
  CLIENT_SCOPES,
  OFFLINE_ACCESS_SCOPE,
  OPENID_SCOPE,
  SCOPES,
  TOKEN_SCOPES,
} from '@gsainfoteam/account-contract';
import { isString } from 'es-toolkit';
import * as z from 'zod/mini';

export { OFFLINE_ACCESS_SCOPE, OPENID_SCOPE, SCOPES };

export const ClientScopeSchema = z.enum(CLIENT_SCOPES);
export const TokenScopeSchema = z.enum(TOKEN_SCOPES);
export const ScopeSchema = z.union([ClientScopeSchema, TokenScopeSchema]);

export type ClientScope = z.infer<typeof ClientScopeSchema>;
export type TokenScope = z.infer<typeof TokenScopeSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export function isScope(value: unknown): value is Scope {
  return ScopeSchema.safeParse(value).success;
}

/** SDK가 모르는 값은 실패하지 않고 버린다. */
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];

  const list = isString(value) ? value.split(' ') : value;

  return list.filter(isScope);
}
