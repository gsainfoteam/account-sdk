import { type IdTokenClaims } from '@gsainfoteam/account-core';
import * as z from 'zod/mini';

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

export interface SessionAdapter {
  login(credential: LoginCredential, body?: unknown): Promise<SessionTokens>;
  refresh(): Promise<SessionTokens | null>;
  logout(accessToken: string | null): Promise<void>;
}

export interface SessionPaths {
  login?: string;
  refresh?: string;
  logout?: string;
}
