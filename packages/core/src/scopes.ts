import * as z from 'zod/mini';

// account-be `src/oauth/types/scope.type.ts` 와 맞춘다.
export const ClientScopeSchema = z.enum([
  'name',
  'profile',
  'picture',
  'email',
  'phone_number',
  'student_id',
]);
export const TokenScopeSchema = z.enum(['openid', 'offline_access']);
export const ScopeSchema = z.union([ClientScopeSchema, TokenScopeSchema]);

export type ClientScope = z.infer<typeof ClientScopeSchema>;
export type TokenScope = z.infer<typeof TokenScopeSchema>;
export type Scope = z.infer<typeof ScopeSchema>;

export function isScope(value: unknown): value is Scope {
  return ScopeSchema.safeParse(value).success;
}

// IdP 가 돌려준 scope 문자열에 SDK 가 모르는 값이 섞여도 응답 전체를 버리지 않는다.
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];
  const list = typeof value === 'string' ? value.split(' ') : value;
  return list.filter(isScope);
}
