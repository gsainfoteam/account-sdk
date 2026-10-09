import { type IdTokenClaims } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

/**
 * client 가 {@link SessionAdapter.start} 에 넘기는 값. `exchange` 옵션에 따라 IdP 토큰이거나,
 * authorization code 와 PKCE verifier 다.
 */
export type LoginCredential =
  | { type: 'idp_token'; accessToken: string; idToken?: string; idTokenClaims?: IdTokenClaims }
  | {
      type: 'code';
      code: string;
      codeVerifier: string;
      redirectUri: string;
      nonce?: string;
      iss?: string;
    };

/** 서비스 백엔드가 로그인과 refresh 에서 돌려주는 토큰. */
export const SessionTokensSchema = z.pipe(
  z.looseObject({
    access_token: z.string().check(z.minLength(1)),
    refresh_token: z.optional(z.string().check(z.minLength(1))),
    expires_in: z.optional(z.number()),
  }),
  z.transform((raw) => ({
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: raw.expires_in,
  })),
);

export type SessionTokens = z.output<typeof SessionTokensSchema>;

/**
 * 서비스 백엔드의 세션을 시작하고, 갱신하고, 끝낸다.
 *
 * {@link cookieSession} 이나 {@link bodySession} 을 쓴다. 요청이나 응답 모양이 다른 백엔드라면 이 인터페이스를
 * 직접 구현한다.
 */
export interface SessionAdapter {
  /** @throws {@link AccountError} 백엔드가 거절하면 `session_rejected`. 백엔드의 body 는 `details` 에 담긴다. */
  start(credential: LoginCredential, body?: unknown): Promise<SessionTokens>;
  /** @returns 복구할 세션이 없으면 `null`. */
  refresh(): Promise<SessionTokens | null>;
  end(accessToken: string | null): Promise<void>;
}

/** 세션 endpoint 의 경로. 빠진 경로는 {@link SESSION_PATHS} 를 쓴다. */
export interface SessionPaths {
  login?: string;
  refresh?: string;
  logout?: string;
}
