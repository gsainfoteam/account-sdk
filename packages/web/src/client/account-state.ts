import { type AccountError } from '@gsainfoteam/account-core';

/** `loading` until the client has tried to restore a session. */
export type AccountStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** Snapshot of the client, kept in a zustand store so React and other frameworks can subscribe. */
export interface AccountState {
  status: AccountStatus;
  /** The service backend's access token. Kept in memory only; a reload restores it through the session's refresh. */
  accessToken: string | null;
  /** Why the last sign-in or refresh failed. */
  error: AccountError | null;
  /** The service backend rejected the login, and {@link AccountClient.retryLogin} can resend it with the same IdP token. */
  canRetryLogin: boolean;
}
