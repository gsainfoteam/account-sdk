import { STORAGE_NAMESPACE } from '@gsainfoteam/account-core';

/** Keys the web client writes, all under {@link STORAGE_NAMESPACE}. */
export const STORAGE_KEYS = {
  transactionPrefix: `${STORAGE_NAMESPACE}:tx:`,
  signedOut: `${STORAGE_NAMESPACE}:signed-out`,
  refreshToken: `${STORAGE_NAMESPACE}:refresh-token`,
} as const;
