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

/** 사용자 정보에 접근하게 해 주는 scope. 목록은 `@gsainfoteam/account-contract` 에서 온다. */
export const ClientScopeSchema = z.enum(CLIENT_SCOPES);
/** 어떤 토큰이 발급될지를 바꾸는 scope. */
export const TokenScopeSchema = z.enum(TOKEN_SCOPES);
export const ScopeSchema = z.union([ClientScopeSchema, TokenScopeSchema]);

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
