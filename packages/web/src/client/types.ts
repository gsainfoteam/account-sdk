import { type AccountError, type Fetch, type Prompt } from '@infoteam/account-core';
import { type StoreApi } from 'zustand/vanilla';

export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AccountState {
  status: AccountStatus;
  accessToken: string | null;
  error: AccountError | null;
  canRetryLogin: boolean;
  redirecting: boolean;
}

export interface LoginOptions {
  returnTo?: string;
  prompt?: Prompt;
}

export interface LogoutOptions {
  idp?: boolean;
  returnTo?: string;
}

export interface RequireAuthOptions {
  /** 라우터 guard에서는 현재 주소가 아직 이전 페이지라서, 이동하려는 대상을 넘겨야 그리로 돌아온다. */
  returnTo?: string;
}

export interface AccountClient<RetryBody = unknown> {
  readonly store: StoreApi<AccountState>;
  readonly loginStartedAt: string | null;
  getAccessToken(): string | null;
  ready(): Promise<void>;
  isHandlingRedirect(): boolean;
  requireAuth(options?: RequireAuthOptions): Promise<void>;
  login(options?: LoginOptions): Promise<void>;
  retryLogin(body: RetryBody): Promise<void>;
  logout(options?: LogoutOptions): Promise<void>;
  refresh(staleToken?: string | null): Promise<string | null>;
  fetch: Fetch;
}
