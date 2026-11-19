import { AccountError, type Fetch } from '@infoteam/account-core';
import { createStore } from 'zustand/vanilla';

import { type AccountClient, type AccountState } from './types';

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
