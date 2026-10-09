import { STORAGE_NAMESPACE } from '@gsainfoteam/account-core';

/** 웹 client 가 쓰는 키. 모두 {@link STORAGE_NAMESPACE} 아래에 있다. */
export const STORAGE_KEYS = {
  transactionPrefix: `${STORAGE_NAMESPACE}:tx:`,
  loggedOut: `${STORAGE_NAMESPACE}:logged-out`,
  refreshToken: `${STORAGE_NAMESPACE}:refresh-token`,
} as const;
