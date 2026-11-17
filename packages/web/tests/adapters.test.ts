// @vitest-environment node
// happy-dom의 Request는 이미 읽은 request로 새 request를 만들어도 에러를 내지 않아서, 재시도 버그를 잡으려면 Node의 Request를 써야 한다.
import { clearDiscoveryCache } from '@infoteam/account-core';
import axios, { type AxiosAdapter } from 'axios';
import { Window } from 'happy-dom';
import createFetchClient from 'openapi-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccountClient } from '../src';
import { fakeServers } from './fake-servers';
import { attachAccount } from '../src/adapters/axios';
import { createAccountMiddleware } from '../src/adapters/openapi-fetch';

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
  // 실제 fetch처럼 보낸 request의 body를 읽는다. 그래야 이미 보낸 request를 다시 보내는 실수가 드러난다.
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

describe('openapi-fetch middleware', () => {
  it('sends the service token and retries once after refreshing', async () => {
    const { client, fetch, refreshes } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch });
    api.use(createAccountMiddleware(client));

    const results = await Promise.all([api.GET('/notices'), api.GET('/notices')]);
    expect(results.map((result) => result.response.status)).toEqual([200, 200]);
    expect(refreshes()).toBe(2);
  });

  it('sends the body again on the retry', async () => {
    const { client, fetch } = setup();
    const api = createFetchClient<Paths>({ baseUrl: `https://${API}`, fetch });
    api.use(createAccountMiddleware(client));

    await client.ready();
    const { response, data } = await api.POST('/notices', { body: { title: 'hello' } });
    expect(response.status).toBe(200);
    expect(data).toEqual({ title: 'hello' });
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
