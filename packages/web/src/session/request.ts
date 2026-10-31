import { AccountError, AUTHORIZATION_HEADER, bearer, type Fetch } from '@gsainfoteam/account-core';
import { attemptAsync, trimEnd } from 'es-toolkit';
import * as z from 'zod/mini';

import { SessionTokensSchema, type SessionTokens } from './session-adapter';

interface Request {
  path: string;
  accessToken?: string;
  body?: unknown;
}

export function createRequester(baseUrl: string, fetch: Fetch | undefined) {
  const base = trimEnd(baseUrl, '/');

  return async ({ path, accessToken, body }: Request): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });
    if (accessToken) headers.set(AUTHORIZATION_HEADER, bearer(accessToken));
    if (body !== undefined) headers.set('content-type', 'application/json');

    const [error, response] = await attemptAsync(() =>
      (fetch ?? globalThis.fetch)(`${base}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'include',
      }),
    );
    if (!response) {
      throw new AccountError('network_error', { description: `POST ${path}`, cause: error });
    }

    return response;
  };
}

export async function readTokens(response: Response, path: string): Promise<SessionTokens> {
  const [, body] = await attemptAsync<unknown>(() => response.json());

  if (!response.ok) {
    // `network_error`는 응답을 받지 못한 경우만 뜻하므로 응답한 5xx와 구분한다.
    throw new AccountError(response.status >= 500 ? 'server_error' : 'unknown', {
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
