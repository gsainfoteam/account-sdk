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
  if (typeof header !== 'string') return undefined;

  const [scheme, token] = header.split(/ +/);
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function readCookie(req: HttpRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return undefined;

  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!pair) return undefined;

  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return undefined;
  }
}
