import { AccountError, AUTHORIZATION_HEADER, bearer, type Fetch } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

import { SessionTokensSchema, type SessionTokens } from './session-adapter';

interface Request {
  path: string;
  accessToken?: string;
  body?: unknown;
}

export function createRequester(baseUrl: string, fetch: Fetch | undefined) {
  const base = baseUrl.replace(/\/+$/, '');
  return async ({ path, accessToken, body }: Request): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });
    if (accessToken) headers.set(AUTHORIZATION_HEADER, bearer(accessToken));
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

export async function readTokens(response: Response, path: string): Promise<SessionTokens> {
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
