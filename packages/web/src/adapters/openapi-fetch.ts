import {
  AUTHORIZATION_HEADER,
  bearer,
  isUnauthorized,
  readBearer,
} from '@gsainfoteam/account-core';
import { type Middleware } from 'openapi-fetch';

import { type AccountClient } from '../client/create-account-client';

/**
 * openapi-fetch middleware that sends the access token and retries once after refreshing on 401.
 * The retry goes through `options.fetch`, which skips the middleware, so it cannot loop.
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
