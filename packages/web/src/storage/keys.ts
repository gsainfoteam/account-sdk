import { STORAGE_NAMESPACE } from '@gsainfoteam/account-core';

export const STORAGE_KEYS = {
  transactionPrefix: `${STORAGE_NAMESPACE}:tx:`,
  loggedOut: `${STORAGE_NAMESPACE}:logged-out`,
  silentLoginTried: `${STORAGE_NAMESPACE}:silent-login-tried`,
  logoutPrefix: `${STORAGE_NAMESPACE}:logout:`,
} as const;
