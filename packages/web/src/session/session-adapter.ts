import { type AccountError } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

export type LoginCredential =
  | {
      code: string;
      codeVerifier: string;
      redirectUri: string;
      nonce: string | undefined;
      iss: string | undefined;
    }
  | { ticket: string };

export const SessionTokensSchema = z.pipe(
  z.looseObject({
    access_token: z.string().check(z.minLength(1)),
    expires_in: z.optional(z.number()),
  }),
  z.transform((raw) => ({ accessToken: raw.access_token, expiresIn: raw.expires_in })),
);

export type SessionTokens = z.output<typeof SessionTokensSchema>;

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
  end(accessToken: string | null): Promise<void>;
}
