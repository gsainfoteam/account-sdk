import {
  AccountError,
  isAuthFailure,
  SESSION_PATHS,
  SESSION_REJECTED,
  type Fetch,
  type LoginRequestBody,
} from '@gsainfoteam/account-core';
import { attemptAsync, isPlainObject } from 'es-toolkit';
import * as z from 'zod/mini';

import { createRequester, readTokens } from './request';
import { type Session, type SessionPaths } from './session-adapter';

const RejectionSchema = z.looseObject({
  ticket: z.optional(z.string()),
  details: z.optional(z.unknown()),
});

export function apiSession(
  baseUrl: string,
  paths: SessionPaths,
  fetch: Fetch | undefined,
): Session {
  const request = createRequester(baseUrl, fetch);
  const { login, refresh, logout } = { ...SESSION_PATHS, ...paths };

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
      // 400과 IdP 실패를 옮긴 502까지 거절로 보면 호출자가 retryLogin 화면을 띄운다.
      if (response.status !== 403) return { tokens: await readTokens(response, login) };

      const [, raw] = await attemptAsync<unknown>(() => response.json());
      const rejection = RejectionSchema.safeParse(raw);
      const error = new AccountError(SESSION_REJECTED, {
        description: `POST ${login}`,
        status: response.status,
        details: rejection.success ? rejection.data.details : raw,
      });

      return { rejected: { error, ticket: rejection.success ? rejection.data.ticket : undefined } };
    },

    async refresh() {
      const response = await request({ path: refresh });
      if (isAuthFailure(response.status)) return null;

      return readTokens(response, refresh);
    },

    async end(accessToken) {
      await request({ path: logout, accessToken: accessToken ?? undefined });
    },
  };
}
