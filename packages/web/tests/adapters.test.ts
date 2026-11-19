// @vitest-environment node
import { clearDiscoveryCache } from '@infoteam/account-core';
import axios, { type AxiosAdapter } from 'axios';
import { Window } from 'happy-dom';
import createFetchClient from 'openapi-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccountClient } from '../src';
import { fakeServers } from './fake-servers';
import { attachAccount } from '../src/adapters/axios';

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
    [`${API}/always-401`]: () => new Response(null, { status: 401 }),
  });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await servers.fetch(input, init);
    if (input instanceof Request && input.body) await input.arrayBuffer();
    return response;
  };
  const client = createAccountClient({
    issuer: 'production',
    clientId: 'ziggle',
    api: `https://${API}`,
    scopes: ['name'],
    fetch,
    redirect: vi.fn(),
  });
  return { ...servers, fetch, client, refreshes: () => refreshes };
}

beforeEach(() => {
  const window = new Window({ url: 'https://ziggle.gistory.me/' });
  vi.stubGlobal('window', window);
  vi.stubGlobal('localStorage', window.localStorage);
  vi.stubGlobal('sessionStorage', window.sessionStorage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearDiscoveryCache();
});

describe('account.fetch as the fetch of openapi-fetch', () => {
  it('sends the service token and retries once after refreshing', async () => {
    const { client, refreshes } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch: client.fetch });

    const results = await Promise.all([api.GET('/notices'), api.GET('/notices')]);
    expect(results.map((result) => result.response.status)).toEqual([200, 200]);
    expect(refreshes()).toBe(2);
  });

  it('sends the body again on the retry', async () => {
    const { client } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch: client.fetch });

    const { response, data } = await api.POST('/notices', { body: { title: 'hello' } });
    expect(response.status).toBe(200);
    expect(data).toEqual({ title: 'hello' });
  });

  it('sends the body again when a middleware replaces the request', async () => {
    const { client } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch: client.fetch });
    api.use({
      onRequest: ({ request }) => {
        const headers = new Headers(request.headers);
        headers.set('x-trace', '1');
        return new Request(request, { headers });
      },
    });

    const { response, data } = await api.POST('/notices', { body: { title: 'hello' } });
    expect(response.status).toBe(200);
    expect(data).toEqual({ title: 'hello' });
  });
});

describe('axios interceptors', () => {
  const fetchAdapter =
    (fetch: typeof globalThis.fetch): AxiosAdapter =>
    async (config) => {
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

  it('sends the service token and retries once after refreshing', async () => {
    const { client, fetch, refreshes } = setup();
    const instance = axios.create({ baseURL: `https://${API}`, adapter: fetchAdapter(fetch) });
    const detach = attachAccount(instance, client);

    await expect(instance.get('/notices')).resolves.toMatchObject({
      status: 200,
      data: [{ id: 1 }],
    });
    expect(refreshes()).toBe(2);

    detach();
    await expect(instance.get('/notices')).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('gives up after one retry when the endpoint keeps answering 401', async () => {
    const { client, fetch, refreshes, callsTo } = setup();
    const instance = axios.create({ baseURL: `https://${API}`, adapter: fetchAdapter(fetch) });
    attachAccount(instance, client);

    await expect(instance.get('/always-401')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(callsTo(`${API}/always-401`)).toHaveLength(2);
    expect(refreshes()).toBe(2);
  });
});
