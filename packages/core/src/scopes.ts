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

const SCOPE_SET: ReadonlySet<string> = new Set<string>([...CLIENT_SCOPES, ...TOKEN_SCOPES]);

export function isScope(value: string): value is Scope {
  return SCOPE_SET.has(value);
}

export function parseScopes(value: string | readonly string[] | undefined | null): Scope[] {
  if (!value) return [];
  const list = typeof value === 'string' ? value.split(' ') : value;
  return list.filter(isScope);
}
