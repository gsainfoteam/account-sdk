import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const ACCESS_TOKEN_TTL = 15 * 60;

interface AccessToken {
  sid: string;
  sub: string;
  expiresAt: number;
}

// shortcut: in-memory, refresh tokens never expire, expired access tokens are not pruned, and a reused refresh token
// is rejected without the grace window that concurrent tabs need; use a database with expiry in a real service.
@Injectable()
export class Sessions {
  private readonly accessTokens = new Map<string, AccessToken>();
  private readonly refreshTokens = new Map<string, { sid: string; sub: string }>();

  issue(sub: string, sid: string = randomUUID()) {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    this.accessTokens.set(accessToken, {
      sid,
      sub,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL * 1000,
    });
    this.refreshTokens.set(refreshToken, { sid, sub });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
  }

  rotate(refreshToken: string) {
    const session = this.refreshTokens.get(refreshToken);
    if (!session) return null;
    this.refreshTokens.delete(refreshToken);
    return this.issue(session.sub, session.sid);
  }

  subjectOf(accessToken: string): string | null {
    const token = this.accessTokens.get(accessToken);
    return token && token.expiresAt > Date.now() ? token.sub : null;
  }

  end(refreshToken: string | undefined, accessToken: string | undefined): void {
    const sid =
      this.refreshTokens.get(refreshToken ?? '')?.sid ??
      this.accessTokens.get(accessToken ?? '')?.sid;
    if (!sid) return;

    for (const tokens of [this.accessTokens, this.refreshTokens]) {
      for (const [token, session] of tokens) {
        if (session.sid === sid) tokens.delete(token);
      }
    }
  }
}
