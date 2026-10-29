import { type AccountError } from '@gsainfoteam/account-core';

/** client가 세션 복구를 시도하기 전까지는 `loading`이다. */
export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AccountState {
  status: AccountStatus;
  /** 메모리에만 두고, 새로고침하면 세션 refresh로 복구한다. */
  accessToken: string | null;
  error: AccountError | null;
  canRetryLogin: boolean;
}
