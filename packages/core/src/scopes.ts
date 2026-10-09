import * as z from 'zod/mini';

// account-be `src/oauth/types/scope.type.ts` 와 맞춘다.
export const CLIENT_SCOPES = [
  'name',
  'profile',
  'picture',
  'email',
  'phone_number',
  'student_id',
] as const;

export const TOKEN_SCOPES = ['openid', 'offline_access'] as const;

export type ClientScope = (typeof CLIENT_SCOPES)[number];
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export type Scope = ClientScope | TokenScope;

export const ScopeSchema: z.ZodMiniType<Scope> = z.enum([...CLIENT_SCOPES, ...TOKEN_SCOPES]);

export function isScope(value: unknown): value is Scope {
  return ScopeSchema.safeParse(value).success;
}

// IdP 가 돌려준 scope 문자열에 SDK 가 모르는 값이 섞여도 응답 전체를 버리지 않는다.
export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];
  const list = typeof value === 'string' ? value.split(' ') : value;
  return list.filter(isScope);
}
