import {
  AUTHORIZATION_HEADER,
  bearer,
  isUnauthorized,
  readBearer,
} from '@gsainfoteam/account-core';
import { type Middleware } from 'openapi-fetch';

import { type AccountClient } from '../client/create-account-client';

/**
 * access token 을 보내고, 401 이면 refresh 한 뒤 한 번 다시 시도하는 openapi-fetch middleware.
 * 재시도는 middleware 를 거치지 않는 `options.fetch` 로 보내므로 무한히 반복되지 않는다.
 *
 * @example
 * ```ts
 * const api = createFetchClient<paths>({ baseUrl });
 * api.use(createAccountMiddleware(account));
 * ```
 */
export function createAccountMiddleware(client: AccountClient): Middleware {
  return {
    async onRequest({ request }) {
      await client.ready();

      const token = client.getAccessToken();
      if (token) request.headers.set(AUTHORIZATION_HEADER, bearer(token));

      return request;
    },

    async onResponse({ request, response, options }) {
      if (!isUnauthorized(response.status)) return response;

      const stale = readBearer(request.headers.get(AUTHORIZATION_HEADER));
      const token = await client.refresh(stale);
      if (!token) return response;

      const retry = new Request(request);
      retry.headers.set(AUTHORIZATION_HEADER, bearer(token));

      return options.fetch(retry);
    },
  };
}
