import { type AccountError } from '@gsainfoteam/account-core';

export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AccountState {
  status: AccountStatus;
  accessToken: string | null;
  error: AccountError | null;
  canRetryLogin: boolean;
}
