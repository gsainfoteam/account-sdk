import {
  AUTHORIZATION_HEADER,
  bearer,
  isUnauthorized,
  readBearer,
} from '@gsainfoteam/account-core';
import { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { type AccountClient } from '../client/create-account-client';

/** 401이면 refresh 한 뒤 한 번 다시 시도한다. 돌려주는 함수를 부르면 interceptor를 제거한다. */
export function attachAccount(instance: AxiosInstance, client: AccountClient): () => void {
  const retried = new WeakSet<InternalAxiosRequestConfig>();

  const request = instance.interceptors.request.use(async (config) => {
    await client.ready();

    const token = client.getAccessToken();
    if (token) config.headers.set(AUTHORIZATION_HEADER, bearer(token));

    return config;
  });

  const response = instance.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config;
    if (!isUnauthorized(error.response?.status) || !config || retried.has(config)) throw error;

    const stale = readBearer(String(config.headers.get(AUTHORIZATION_HEADER) ?? ''));
    const token = await client.refresh(stale);
    if (!token) throw error;

    retried.add(config);
    config.headers.set(AUTHORIZATION_HEADER, bearer(token));

    return instance.request(config);
  });

  return () => {
    instance.interceptors.request.eject(request);
    instance.interceptors.response.eject(response);
  };
}
