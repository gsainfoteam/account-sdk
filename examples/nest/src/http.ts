export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  sub?: string;
}

export interface HttpResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options: object): void;
}

export function bearerToken(req: HttpRequest): string | undefined {
  const header = req.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function readCookie(req: HttpRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return undefined;

  const pair = header.split('; ').find((part) => part.startsWith(`${name}=`));
  return pair && decodeURIComponent(pair.slice(name.length + 1));
}
