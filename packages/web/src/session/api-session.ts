import {
  AccountError,
  isAuthFailure,
  SESSION_PATHS,
  SESSION_REJECTED,
  STORAGE_NAMESPACE,
  type Fetch,
  type LoginRequestBody,
} from '@infoteam/account-core';
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
  const refreshLock = `${STORAGE_NAMESPACE}:refresh:${baseUrl}${refresh}`;

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

    refresh() {
      return acrossTabs(refreshLock, async () => {
        const response = await request({ path: refresh });
        if (isAuthFailure(response.status)) return null;

        return readTokens(response, refresh);
      });
    },

    async end(accessToken) {
      await request({ path: logout, accessToken: accessToken ?? undefined });
    },
  };
}

/**
 * 탭들은 refresh 쿠키 하나를 같이 쓴다. 두 탭이 같은 쿠키로 refresh 하면 서버는 유예 시간 안이라 둘에게 같은 새 토큰을
 * 주는데, 한쪽 응답이 늦게 오면 그 사이 다른 탭이 한 번 더 바꾼 쿠키를 예전 토큰으로 되돌린다. 되돌아간 토큰은 유예
 * 시간이 지난 뒤 재사용으로 처리되어 살아 있는 세션이 끝나므로, 다른 탭의 refresh가 응답을 받은 뒤에 보낸다.
 */
function acrossTabs<T>(name: string, task: () => Promise<T>): Promise<T> {
  // secure context가 아니면 Web Locks가 없다. 이때는 서버의 유예 시간에만 기댄다.
  const locks = navigator.locks as LockManager | null | undefined;
  return locks ? locks.request(name, task) : task();
}
