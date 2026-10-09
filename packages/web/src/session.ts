import { AccountError, type Fetch, type IdTokenClaims } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

export type LoginCredential =
  | { type: 'idp_token'; accessToken: string; idToken?: string; idTokenClaims?: IdTokenClaims }
  | {
      type: 'code';
      code: string;
      codeVerifier: string;
      redirectUri: string;
      nonce?: string;
      iss?: string;
    };

export const SessionTokensSchema = z.pipe(
  z.looseObject({
    access_token: z.string().check(z.minLength(1)),
    refresh_token: z.optional(z.string().check(z.minLength(1))),
    expires_in: z.optional(z.number()),
  }),
  z.transform((raw) => ({
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: raw.expires_in,
  })),
);

export type SessionTokens = z.output<typeof SessionTokensSchema>;

export interface SessionAdapter {
  login(credential: LoginCredential, body?: unknown): Promise<SessionTokens>;
  refresh(): Promise<SessionTokens | null>;
  logout(accessToken: string | null): Promise<void>;
}

export interface SessionPaths {
  login?: string;
  refresh?: string;
  logout?: string;
}

interface Request {
  path: string;
  accessToken?: string;
  body?: unknown;
}

function createRequester(baseUrl: string, fetch: Fetch | undefined) {
  const base = baseUrl.replace(/\/+$/, '');
  return async ({ path, accessToken, body }: Request): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    if (body !== undefined) headers.set('content-type', 'application/json');
    try {
      return await (fetch ?? globalThis.fetch)(`${base}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'include',
      });
    } catch (cause) {
      throw new AccountError('network_error', { description: `POST ${path}`, cause });
    }
  };
}

async function readTokens(response: Response, path: string): Promise<SessionTokens> {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new AccountError('session_rejected', {
      description: `POST ${path}`,
      status: response.status,
      details: body,
    });
  }
  const parsed = SessionTokensSchema.safeParse(body);
  if (!parsed.success) {
    throw new AccountError('server_error', {
      description: `POST ${path}: ${z.prettifyError(parsed.error)}`,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export interface CookieSessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
}

export function cookieSession({
  baseUrl,
  paths = {},
  fetch,
}: CookieSessionOptions): SessionAdapter {
  const request = createRequester(baseUrl, fetch);
  const { login = '/auth/login', refresh = '/auth/refresh', logout = '/auth/logout' } = paths;

  return {
    async login(credential, body) {
      if (credential.type !== 'idp_token') {
        throw new AccountError('invalid_request', {
          description: "cookieSession needs exchange: 'browser'",
        });
      }
      return readTokens(
        await request({ path: login, accessToken: credential.accessToken, body }),
        login,
      );
    },
    async refresh() {
      const response = await request({ path: refresh });
      if (response.status === 401 || response.status === 403) return null;
      return readTokens(response, refresh);
    },
    async logout(accessToken) {
      await request({ path: logout, accessToken: accessToken ?? undefined });
    },
  };
}

export interface BodySessionOptions {
  baseUrl: string;
  paths?: SessionPaths;
  fetch?: Fetch;
  storage?: Storage;
  storageKey?: string;
}

export function bodySession({
  baseUrl,
  paths = {},
  fetch,
  storage = globalThis.localStorage,
  storageKey = 'gsainfoteam-account:refresh-token',
}: BodySessionOptions): SessionAdapter {
  const request = createRequester(baseUrl, fetch);
  const { login = '/auth/login', refresh = '/auth/refresh', logout = '/auth/logout' } = paths;

  const keep = (tokens: SessionTokens): SessionTokens => {
    if (tokens.refreshToken) storage.setItem(storageKey, tokens.refreshToken);
    return tokens;
  };

  return {
    async login(credential, body) {
      const response =
        credential.type === 'code'
          ? await request({
              path: login,
              body: {
                code: credential.code,
                code_verifier: credential.codeVerifier,
                redirect_uri: credential.redirectUri,
                ...(credential.nonce ? { nonce: credential.nonce } : {}),
                ...(credential.iss ? { iss: credential.iss } : {}),
                ...(body as object | undefined),
              },
            })
          : await request({ path: login, accessToken: credential.accessToken, body });
      return keep(await readTokens(response, login));
    },
    async refresh() {
      const refreshToken = storage.getItem(storageKey);
      if (!refreshToken) return null;
      const response = await request({ path: refresh, body: { refresh_token: refreshToken } });
      if (response.status === 401 || response.status === 403) {
        storage.removeItem(storageKey);
        return null;
      }
      return keep(await readTokens(response, refresh));
    },
    async logout(accessToken) {
      const refreshToken = storage.getItem(storageKey);
      storage.removeItem(storageKey);
      await request({
        path: logout,
        accessToken: accessToken ?? undefined,
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      });
    },
  };
}
