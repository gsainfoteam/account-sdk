import {
  AccountError,
  isAuthFailure,
  SESSION_PATHS,
  SESSION_REJECTED,
  STORAGE_NAMESPACE,
  type Fetch,
  type LoginRequestBody,
} from '@infoteam/account-core';
import { attemptAsync, isPlainObject, isString, trimEnd } from 'es-toolkit';
import * as z from 'zod/mini';

import { createRequester, readTokens } from './request';
import { type Session, type SessionPaths } from './session-adapter';
import { type AccountClientOptions } from '../client/options';

const RejectionSchema = z.looseObject({
  ticket: z.optional(z.string()),
  reason: z.optional(z.string()),
  details: z.optional(z.unknown()),
});

export function apiSession(
  baseUrl: string,
  paths: SessionPaths,
  fetch: Fetch | undefined,
): Session {
  const request = createRequester(baseUrl, fetch);
  const { login, refresh, logout } = { ...SESSION_PATHS, ...paths };
  const refreshLock = `${STORAGE_NAMESPACE}:refresh:${trimEnd(baseUrl, '/')}${refresh}`;

  return {
    async start(credential, body) {
      const extra = isPlainObject(body) ? body : {};
      const protocol: LoginRequestBody =
        'ticket' in credential
          ? { ticket: credential.ticket }
          : {
              code: credential.code,
              code_verifier: credential.codeVerifier,
              redirect_uri: credential.redirectUri,
              nonce: credential.nonce,
              iss: credential.iss,
            };

      const response = await request({
        path: login,
        body: { ...extra, ...protocol, transport: 'cookie' } satisfies LoginRequestBody,
      });
      const rejected = response.status === 403;
      if (!rejected) return { tokens: await readTokens(response, login) };

      const [, raw] = await attemptAsync<unknown>(() => response.json());
      const rejection = RejectionSchema.safeParse(raw);
      const error = new AccountError(SESSION_REJECTED, {
        description: `POST ${login}`,
        status: response.status,
        reason: rejection.success ? rejection.data.reason : undefined,
        details: rejection.success ? rejection.data.details : raw,
      });

      return { rejected: { error, ticket: rejection.success ? rejection.data.ticket : undefined } };
    },

    refresh() {
      return acrossTabs(refreshLock, async () => {
        const response = await request({ path: refresh });
        if (isAuthFailure(response.status)) return null;

        return readTokens(response, refresh);
      });
    },

    async end(accessToken) {
      const response = await request({
        path: logout,
        accessToken: accessToken ?? undefined,
        keepalive: true,
      });
      if (response.ok || isAuthFailure(response.status)) return;

      throw new AccountError(response.status >= 500 ? 'server_error' : 'unknown', {
        description: `POST ${logout}`,
        status: response.status,
      });
    },
  };
}

function acrossTabs<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = navigator.locks as LockManager | null | undefined;
  return locks ? locks.request(name, task) : task();
}

export function sessionFromApi(
  api: NonNullable<AccountClientOptions['api']>,
  fetch: Fetch | undefined,
): Session {
  const { baseUrl, paths = {} } = isString(api) ? { baseUrl: api } : api;
  return apiSession(baseUrl, paths, fetch);
}
