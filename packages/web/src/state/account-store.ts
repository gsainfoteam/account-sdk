import { type AccountState } from '../client/types';

export function sameState(a: AccountState, b: AccountState): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.error === b.error &&
    a.canRetryLogin === b.canRetryLogin
  );
}
