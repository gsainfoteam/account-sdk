import { clearDiscoveryCache } from '@infoteam/account-core';
import createFetchClient from 'openapi-fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccountClient } from '../src';
import { fakeServers } from './fake-servers';

const API = 'api.ziggle.gistory.me';

interface Paths {
  '/notices': {
    get: { responses: { 200: { content: { 'application/json': { id: number }[] } } } };
    post: {
      requestBody: { content: { 'application/json': { title: string } } };
      responses: { 200: { content: { 'application/json': { title: string } } } };
    };
  };
}

function setup() {
  let refreshes = 0;
  const servers = fakeServers({
    [`${API}/auth/refresh`]: () => Response.json({ access_token: `token-${++refreshes}` }),
    [`${API}/notices`]: ({ headers, method, body }) =>
      headers.get('authorization') !== 'Bearer token-2'
        ? new Response(null, { status: 401 })
        : method === 'POST'
          ? new Response(body, { headers: { 'content-type': 'application/json' } })
          : Response.json([{ id: 1 }]),
  });
  const account = createAccountClient({
    issuer: 'production',
    clientId: 'ziggle',
    api: `https://${API}`,
    scopes: ['name'],
    fetch: servers.fetch,
    redirect: vi.fn(),
  });
  const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch: account.fetch });
  return { api, refreshes: () => refreshes };
}

afterEach(() => clearDiscoveryCache());

describe('account.fetch as the fetch of openapi-fetch', () => {
  it('sends the service token and retries once after refreshing', async () => {
    const { api, refreshes } = setup();

    const results = await Promise.all([api.GET('/notices'), api.GET('/notices')]);
    expect(results.map((result) => result.response.status)).toEqual([200, 200]);
    expect(refreshes()).toBe(2);
  });

  it('sends the body again on the retry', async () => {
    const { api } = setup();

    const { response, data } = await api.POST('/notices', { body: { title: 'hello' } });
    expect(response.status).toBe(200);
    expect(data).toEqual({ title: 'hello' });
  });
});
