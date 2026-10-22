import { type AccountError } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

/** client 가 서비스 백엔드 로그인에 넘기는 값. callback 의 code 이거나, 거절된 로그인을 이어 가는 ticket 이다. */
export type LoginCredential =
  | {
      code: string;
      codeVerifier: string;
      redirectUri: string;
      nonce: string | undefined;
      iss: string | undefined;
    }
  | { ticket: string };

/** 서비스 백엔드가 로그인과 refresh 에서 돌려주는 토큰. */
export const SessionTokensSchema = z.pipe(
  z.looseObject({
    access_token: z.string().check(z.minLength(1)),
    expires_in: z.optional(z.number()),
  }),
  z.transform((raw) => ({ accessToken: raw.access_token, expiresIn: raw.expires_in })),
);

export type SessionTokens = z.output<typeof SessionTokensSchema>;

/**
 * 서비스 백엔드가 로그인을 거절한 결과. `ticket` 이 있으면 같은 사용자로 로그인을 다시 시도할 수 있다.
 * code 는 한 번만 교환할 수 있어서, 재시도는 백엔드가 이미 확인한 사용자를 담은 ticket 으로 한다.
 */
export interface SessionRejection {
  error: AccountError;
  ticket: string | undefined;
}

/** 서비스 백엔드 세션 endpoint 의 경로. 빠진 경로는 `SESSION_PATHS` 를 쓴다. */
export interface SessionPaths {
  login?: string;
  refresh?: string;
  logout?: string;
}

export interface Session {
  start(
    credential: LoginCredential,
    body?: unknown,
  ): Promise<{ tokens: SessionTokens } | { rejected: SessionRejection }>;
  /** @returns 복구할 세션이 없으면 `null`. */
  refresh(): Promise<SessionTokens | null>;
  end(accessToken: string | null): Promise<void>;
}
