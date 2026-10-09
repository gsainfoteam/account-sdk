import { STORAGE_NAMESPACE } from '@gsainfoteam/account-core';

/** Keys the web client writes, all under {@link STORAGE_NAMESPACE}. */
export const STORAGE_KEYS = {
  transactionPrefix: `${STORAGE_NAMESPACE}:tx:`,
  loggedOut: `${STORAGE_NAMESPACE}:logged-out`,
  refreshToken: `${STORAGE_NAMESPACE}:refresh-token`,
} as const;
