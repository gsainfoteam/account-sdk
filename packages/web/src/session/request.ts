import {
  AccountError,
  AccountErrorCodeSchema,
  AUTHORIZATION_HEADER,
  bearer,
  type AccountErrorCode,
  type Fetch,
} from '@infoteam/account-core';
import { attemptAsync, trimEnd } from 'es-toolkit';
import * as z from 'zod/mini';

import { SessionTokensSchema, type SessionTokens } from './session-adapter';

interface Request {
  path: string;
  accessToken?: string;
  body?: unknown;
  /** 페이지를 떠나는 중에도 요청이 끝까지 가게 한다. 로그아웃 직후 IdP로 이동하는 경우에 쓴다. */
  keepalive?: boolean;
}

const ErrorBodySchema = z.looseObject({ error: AccountErrorCodeSchema });

export function createRequester(baseUrl: string, fetch: Fetch | undefined) {
  const base = trimEnd(baseUrl, '/');

  return async ({ path, accessToken, body, keepalive }: Request): Promise<Response> => {
    const headers = new Headers({ accept: 'application/json' });
    if (accessToken) headers.set(AUTHORIZATION_HEADER, bearer(accessToken));
    if (body !== undefined) headers.set('content-type', 'application/json');

    const [error, response] = await attemptAsync(() =>
      (fetch ?? globalThis.fetch)(`${base}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'include',
        keepalive,
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
    throw new AccountError(failureCode(response.status, body), {
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

/** 백엔드가 `toHttpException`처럼 `{ error }`에 SDK 코드를 담아 보내면 그 코드를 쓴다. */
function failureCode(status: number, body: unknown): AccountErrorCode {
  const known = ErrorBodySchema.safeParse(body);
  if (known.success) return known.data.error;

  // `network_error`는 응답을 받지 못한 경우만 뜻하므로 응답한 5xx와 구분한다.
  return status >= 500 ? 'server_error' : 'unknown';
}
