import { type AccountError, type Fetch, type Prompt } from '@infoteam/account-core';
import { type StoreApi } from 'zustand/vanilla';

export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AccountState {
  status: AccountStatus;
  accessToken: string | null;
  error: AccountError | null;
  canRetryLogin: boolean;
  /**
   * IdP에서 돌아온 로그인을 마무리하거나 자동 로그인을 시도하는 중이거나, 페이지가 IdP(또는 MPA에서 로그인 전 위치)로
   * 떠나는 중이면 `true`다. 그동안 `ready()`와 `requireAuth()`는 끝나지 않는다. bfcache로 페이지가 돌아오면 `false`가
   * 된다.
   */
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

export interface AccountClient {
  readonly store: StoreApi<AccountState>;
  getAccessToken(): string | null;
  ready(): Promise<void>;
  /** `store.getState().redirecting`을 읽는다. */
  isHandlingRedirect(): boolean;
  requireAuth(options?: RequireAuthOptions): Promise<void>;
  login(options?: LoginOptions): Promise<void>;
  retryLogin(body: unknown): Promise<void>;
  logout(options?: LogoutOptions): Promise<void>;
  refresh(staleToken?: string | null): Promise<string | null>;
  fetch: Fetch;
}
