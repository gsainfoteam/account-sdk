import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const ACCESS_TOKEN_TTL = 15 * 60;

// shortcut: in-memory, never expires refresh tokens or prunes old access tokens, and logout only drops the tokens it is given;
// a real service stores sessions in a database with expiry and revokes every token of the session on logout.
@Injectable()
export class Sessions {
  private readonly accessTokens = new Map<string, { sub: string; expiresAt: number }>();
  private readonly refreshTokens = new Map<string, string>();

  issue(sub: string) {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    this.accessTokens.set(accessToken, { sub, expiresAt: Date.now() + ACCESS_TOKEN_TTL * 1000 });
    this.refreshTokens.set(refreshToken, sub);
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
  }

  rotate(refreshToken: string) {
    const sub = this.refreshTokens.get(refreshToken);
    if (!sub) return null;
    this.refreshTokens.delete(refreshToken);
    return this.issue(sub);
  }

  subjectOf(accessToken: string): string | null {
    const session = this.accessTokens.get(accessToken);
    return session && session.expiresAt > Date.now() ? session.sub : null;
  }

  end(refreshToken: string | undefined, accessToken: string | undefined): void {
    if (refreshToken) this.refreshTokens.delete(refreshToken);
    if (accessToken) this.accessTokens.delete(accessToken);
  }
}
