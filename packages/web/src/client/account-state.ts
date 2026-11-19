import { type AccountError } from '@infoteam/account-core';

export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AccountState {
  status: AccountStatus;
  accessToken: string | null;
  error: AccountError | null;
  canRetryLogin: boolean;
}

export function sameState(a: AccountState, b: AccountState): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.error === b.error &&
    a.canRetryLogin === b.canRetryLogin
  );
}
