import { randomUUID } from 'node:crypto';

import { type UserInfo } from '@gsainfoteam/account-nest';
import { Injectable } from '@nestjs/common';

interface Session {
  user: UserInfo;
  accessToken: string;
}

@Injectable()
export class SessionService {
  private readonly byRefresh = new Map<string, Session>();
  private readonly byAccess = new Map<string, UserInfo>();

  issue(user: UserInfo): { accessToken: string; refreshToken: string } {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    this.byAccess.set(accessToken, user);
    this.byRefresh.set(refreshToken, { user, accessToken });
    return { accessToken, refreshToken };
  }

  rotate(refreshToken: string): { accessToken: string; refreshToken: string } | null {
    const session = this.byRefresh.get(refreshToken);
    if (!session) return null;
    this.revoke(refreshToken);
    return this.issue(session.user);
  }

  revoke(refreshToken: string): void {
    const session = this.byRefresh.get(refreshToken);
    if (session) this.byAccess.delete(session.accessToken);
    this.byRefresh.delete(refreshToken);
  }

  userOf(accessToken: string): UserInfo | undefined {
    return this.byAccess.get(accessToken);
  }
}
