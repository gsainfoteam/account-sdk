import { STORAGE_NAMESPACE } from '@gsainfoteam/account-core';

export const STORAGE_KEYS = {
  transactionPrefix: `${STORAGE_NAMESPACE}:tx:`,
  signedOut: `${STORAGE_NAMESPACE}:signed-out`,
  refreshToken: `${STORAGE_NAMESPACE}:refresh-token`,
} as const;
