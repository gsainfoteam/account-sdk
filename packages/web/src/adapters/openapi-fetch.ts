import { type Middleware } from 'openapi-fetch';

import { type AccountClient } from '../client/create-account-client';

export function createAccountMiddleware(client: AccountClient): Middleware {
  return {
    async onRequest({ request }) {
      await client.ready();
      const token = client.getAccessToken();
      if (token) request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
    async onResponse({ request, response, options }) {
      if (response.status !== 401) return response;
      const stale = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null;
      const token = await client.refresh(stale);
      if (!token) return response;
      const retry = new Request(request);
      retry.headers.set('authorization', `Bearer ${token}`);
      // options.fetch 는 미들웨어를 다시 거치지 않으므로 재시도가 또 401 이어도 반복되지 않는다.
      return options.fetch(retry);
    },
  };
}
