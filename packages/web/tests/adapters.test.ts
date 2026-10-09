import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import axios, { type AxiosAdapter } from 'axios';
import createFetchClient from 'openapi-fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cookieSession, createAccountClient } from '../src';
import { fakeServers } from './fake-servers';
import { attachAccount } from '../src/adapters/axios';
import { createAccountMiddleware } from '../src/adapters/openapi-fetch';

const API = 'api.ziggle.gistory.me';

interface Paths {
  '/notices': {
    get: { responses: { 200: { content: { 'application/json': { id: number }[] } } } };
  };
}

function setup() {
  let refreshes = 0;
  const servers = fakeServers({
    [`${API}/auth/refresh`]: () => Response.json({ access_token: `token-${++refreshes}` }),
    [`${API}/notices`]: ({ headers }) =>
      headers.get('authorization') === 'Bearer token-2'
        ? Response.json([{ id: 1 }])
        : new Response(null, { status: 401 }),
  });
  const client = createAccountClient({
    issuer: 'production',
    clientId: 'ziggle',
    redirectUri: '/auth/callback',
    scopes: ['name'],
    exchange: 'browser',
    session: cookieSession({ baseUrl: `https://${API}`, fetch: servers.fetch }),
    fetch: servers.fetch,
    redirect: vi.fn(),
  });
  return { ...servers, client, refreshes: () => refreshes };
}

afterEach(() => clearDiscoveryCache());

describe('openapi-fetch middleware', () => {
  it('sends the service token and retries once after refreshing', async () => {
    const { client, fetch, refreshes } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch });
    api.use(createAccountMiddleware(client));

    const results = await Promise.all([api.GET('/notices'), api.GET('/notices')]);
    expect(results.map((result) => result.response.status)).toEqual([200, 200]);
    expect(refreshes()).toBe(2);
  });
});

describe('axios interceptors', () => {
  it('sends the service token and retries once after refreshing', async () => {
    const { client, fetch, refreshes } = setup();
    const adapter: AxiosAdapter = async (config) => {
      const response = await fetch(`${config.baseURL}${config.url}`, {
        headers: Object.fromEntries(
          Object.entries(config.headers.toJSON()).map(([k, v]) => [k, String(v)]),
        ),
      });
      const result = {
        data: response.status === 200 ? await response.json() : null,
        status: response.status,
        statusText: '',
        headers: {},
        config,
      };
      if (response.status >= 400) {
        throw new axios.AxiosError('failed', String(response.status), config, null, result);
      }
      return result;
    };
    const instance = axios.create({ baseURL: `https://${API}`, adapter });
    const detach = attachAccount(instance, client);

    await expect(instance.get('/notices')).resolves.toMatchObject({
      status: 200,
      data: [{ id: 1 }],
    });
    expect(refreshes()).toBe(2);

    detach();
    await expect(instance.get('/notices')).rejects.toMatchObject({ response: { status: 401 } });
  });
});
