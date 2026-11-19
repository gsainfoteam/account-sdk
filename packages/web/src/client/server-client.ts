import { AccountError, type Fetch } from '@infoteam/account-core';
import { createStore } from 'zustand/vanilla';

import { type AccountState } from './account-state';
import { type AccountClient } from './create-account-client';

/**
 * 서버에는 브라우저 세션이 없으므로 `loading`에 머문다. 서버에서 그린 HTML과 브라우저의 첫 렌더가 같아야 hydration이
 * 어긋나지 않는다. 브라우저에서 모듈이 다시 실행되면 그때 진짜 client가 만들어진다.
 */
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
