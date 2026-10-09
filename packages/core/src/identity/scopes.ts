import { isString } from 'es-toolkit';
import * as z from 'zod/mini';

import { ClientScopeSchema } from './client-scopes.generated';

export { ClientScopeSchema };

/** id_token 을 받게 하는 OpenID Connect scope. 이 scope 가 있으면 `nonce` 도 보낸다. */
export const OPENID_SCOPE = 'openid';
/** refresh token 을 받게 하는 OpenID Connect scope. 이 scope 가 있으면 `prompt=consent` 도 붙인다. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

/** 어떤 토큰이 발급될지를 바꾸는 scope. */
export const TokenScopeSchema = z.enum([OPENID_SCOPE, OFFLINE_ACCESS_SCOPE]);
export const ScopeSchema = z.union([ClientScopeSchema, TokenScopeSchema]);
/** SDK 가 아는 모든 scope. */
export const SCOPES: readonly Scope[] = [...ClientScopeSchema.options, ...TokenScopeSchema.options];

export type ClientScope = z.infer<typeof ClientScopeSchema>;
export type TokenScope = z.infer<typeof TokenScopeSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export function isScope(value: unknown): value is Scope {
  return ScopeSchema.safeParse(value).success;
}

/** 공백으로 구분한 scope 문자열을 읽는다. SDK 가 모르는 값은 실패하지 않고 버린다. */
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];

  const list = isString(value) ? value.split(' ') : value;

  return list.filter(isScope);
}
