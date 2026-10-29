import { AccountError, isAuthFailure, SESSION_PATHS, type Fetch } from '@gsainfoteam/account-core';
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
      const protocol =
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
        body: { ...extra, ...protocol, transport: 'cookie' },
      });
      if (response.ok) return { tokens: await readTokens(response, login) };

      const [, raw] = await attemptAsync<unknown>(() => response.json());
      const rejection = RejectionSchema.safeParse(raw);
      const error = new AccountError('session_rejected', {
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
