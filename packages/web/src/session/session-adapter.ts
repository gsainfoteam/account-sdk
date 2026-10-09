import { type IdTokenClaims } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

/**
 * What the client hands to {@link SessionAdapter.login}, depending on the `exchange` option:
 * the IdP tokens, or the authorization code with its PKCE verifier.
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

/** Tokens a service backend returns from login and refresh. */
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
 * Starts, refreshes and ends a service backend's session.
 *
 * Use {@link cookieSession} or {@link bodySession}, or implement this interface for a backend whose
 * requests or responses look different.
 */
export interface SessionAdapter {
  /** @throws {@link AccountError} `session_rejected` with the backend's body in `details` when it refuses. */
  login(credential: LoginCredential, body?: unknown): Promise<SessionTokens>;
  /** @returns `null` when there is no session to restore. */
  refresh(): Promise<SessionTokens | null>;
  logout(accessToken: string | null): Promise<void>;
}

/** Paths of the session endpoints. Any path left out uses {@link SESSION_PATHS}. */
export interface SessionPaths {
  login?: string;
  refresh?: string;
  logout?: string;
}
