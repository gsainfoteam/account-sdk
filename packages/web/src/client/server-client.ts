import { AccountError, type Fetch } from '@infoteam/account-core';
import { createStore } from 'zustand/vanilla';

import { type AccountClient } from './account-client';
import { type AccountState } from './account-state';

// 서버에서 그린 HTML이 브라우저의 첫 렌더와 같아야 hydration이 어긋나지 않으므로 `loading`에 머문다.
export function createServerClient(fetch: Fetch | undefined): AccountClient {
  const store = createStore<AccountState>(() => ({
    status: 'loading',
    accessToken: null,
    error: null,
    canRetryLogin: false,
  }));

  const browserOnly = async (): Promise<never> => {
    throw new AccountError('invalid_request', { description: 'only available in the browser' });
  };

  return {
    store,
    getAccessToken: () => null,
    ready: async () => undefined,
    isHandlingRedirect: () => false,
    requireAuth: browserOnly,
    login: browserOnly,
    retryLogin: browserOnly,
    logout: async () => undefined,
    refresh: async () => null,
    fetch: (input, init) => (fetch ?? globalThis.fetch)(input, init),
  };
}
