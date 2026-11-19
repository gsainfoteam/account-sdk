import { AUTHORIZATION_HEADER, bearer, isUnauthorized, readBearer } from '@infoteam/account-core';
import { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { type AccountClient } from '../client/account-client';

// axios는 다시 보낼 때 config를 새 객체로 합치므로, 재시도 표시를 config 속성으로 둬야 401이 반복돼도 한 번만 다시 보낸다.
const RETRIED = 'accountRetried';

type RetriedConfig = InternalAxiosRequestConfig & { [RETRIED]?: boolean };

/** 401이면 refresh 한 뒤 한 번 다시 시도한다. 돌려주는 함수를 부르면 interceptor를 제거한다. */
export function attachAccount(instance: AxiosInstance, client: AccountClient): () => void {
  const request = instance.interceptors.request.use(async (config) => {
    await client.ready();

    const token = client.getAccessToken();
    if (token) config.headers.set(AUTHORIZATION_HEADER, bearer(token));

    return config;
  });

  const response = instance.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config: RetriedConfig | undefined = error.config;
    if (!isUnauthorized(error.response?.status) || !config || config[RETRIED]) throw error;

    const stale = readBearer(String(config.headers.get(AUTHORIZATION_HEADER) ?? ''));
    const token = await client.refresh(stale);
    if (!token) throw error;

    config[RETRIED] = true;
    config.headers.set(AUTHORIZATION_HEADER, bearer(token));

    return instance.request(config);
  });

  return () => {
    instance.interceptors.request.eject(request);
    instance.interceptors.response.eject(response);
  };
}
