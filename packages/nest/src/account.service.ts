import {
  type AccountServer,
  type ExchangeCodeParams,
  type IdTokenClaims,
  type RevokeParams,
  type TokenResponse,
  type UserInfo,
} from '@gsainfoteam/account-server';
import { Inject, Injectable } from '@nestjs/common';

import { ACCOUNT_SERVER } from './account.module-definition';

/** {@link AccountServer} as a Nest provider. Inject it wherever the IdP is needed. */
@Injectable()
export class AccountService implements AccountServer {
  constructor(@Inject(ACCOUNT_SERVER) private readonly server: AccountServer) {}

  metadata(): ReturnType<AccountServer['metadata']> {
    return this.server.metadata();
  }

  getUserInfo(accessToken: string): Promise<UserInfo> {
    return this.server.getUserInfo(accessToken);
  }

  exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse> {
    return this.server.exchangeCode(params);
  }

  loginWithCode(params: ExchangeCodeParams): Promise<{ tokens: TokenResponse; user: UserInfo }> {
    return this.server.loginWithCode(params);
  }

  getUserInfoBySub(sub: string): Promise<UserInfo> {
    return this.server.getUserInfoBySub(sub);
  }

  verifyIdToken(idToken: string, options?: { nonce?: string }): Promise<IdTokenClaims> {
    return this.server.verifyIdToken(idToken, options);
  }

  revoke(params: RevokeParams): Promise<void> {
    return this.server.revoke(params);
  }
}
