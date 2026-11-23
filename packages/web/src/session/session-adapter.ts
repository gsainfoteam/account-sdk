import { SessionTokensResponseSchema, type AccountError } from '@infoteam/account-core';
import * as z from 'zod/mini';

export type LoginCredential =
  | {
      code: string;
      codeVerifier: string;
      redirectUri: string;
      nonce: string;
      iss: string | undefined;
    }
  | { ticket: string };

export const SessionTokensSchema = z.pipe(
  SessionTokensResponseSchema,
  z.transform((raw) => ({ accessToken: raw.access_token, expiresIn: raw.expires_in })),
);

export interface SessionTokens {
  accessToken: string;
  expiresIn?: number | undefined;
}

/** code는 한 번만 교환할 수 있어서, 재시도할 때는 백엔드가 이미 확인한 사용자를 담은 ticket을 쓴다. */
export interface SessionRejection {
  error: AccountError;
  ticket: string | undefined;
}

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
  refresh(): Promise<SessionTokens | null>;
  /** 세션이 끝났거나 이미 없으면 resolve 하고, 끝났는지 모르면 throw 한다. throw 하면 다음 시작 때 `end(null)`로 다시 부른다. */
  end(accessToken: string | null): Promise<void>;
}
