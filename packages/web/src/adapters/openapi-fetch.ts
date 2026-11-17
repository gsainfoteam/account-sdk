import { AUTHORIZATION_HEADER, bearer, isUnauthorized, readBearer } from '@infoteam/account-core';
import { type Middleware } from 'openapi-fetch';

import { type AccountClient } from '../client/create-account-client';

/**
 * 401이면 refresh 한 뒤 한 번 다시 시도한다. 재시도는 middleware를 거치지 않는 `options.fetch`로 보내므로
 * 무한히 반복되지 않는다.
 */
export function createAccountMiddleware(client: AccountClient): Middleware {
  // openapi-fetch는 보낸 request를 onResponse에 넘기는데, 그 body는 이미 읽혀서 다시 보낼 수 없다.
  // 뒤의 middleware가 request를 새 객체로 바꿔도 찾을 수 있도록 request 객체가 아니라 id로 묶는다.
  const unsentBodies = new Map<string, Request>();

  return {
    async onRequest({ request, id }) {
      await client.ready();

      const token = client.getAccessToken();
      if (token) request.headers.set(AUTHORIZATION_HEADER, bearer(token));

      if (request.body) unsentBodies.set(id, request.clone());
      return request;
    },

    async onResponse({ request, response, options, id }) {
      const unsent = unsentBodies.get(id);
      unsentBodies.delete(id);

      if (!isUnauthorized(response.status)) return response;
      if (request.bodyUsed && !unsent) return response;

      const stale = readBearer(request.headers.get(AUTHORIZATION_HEADER));
      const token = await client.refresh(stale);
      if (!token) return response;

      const retry = new Request(unsent ?? request, { headers: request.headers });
      retry.headers.set(AUTHORIZATION_HEADER, bearer(token));

      return options.fetch(retry);
    },

    onError({ id }) {
      unsentBodies.delete(id);
    },
  };
}
