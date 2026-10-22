import { vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };

export interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

export type Route = (call: Call) => Response | Promise<Response>;

export function fakeServers(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const call: Call = {
      url,
      method: init?.method ?? request.method,
      headers: new Headers(init?.headers ?? request.headers),
      body:
        init?.body !== undefined && init?.body !== null
          ? String(init.body)
          : await request.clone().text(),
    };
    calls.push(call);
    if (url.pathname === '/.well-known/openid-configuration') return Response.json(production);
    const route = routes[`${url.host}${url.pathname}`];
    return route ? route(call) : new Response('not found', { status: 404 });
  });
  const callsTo = (hostPath: string) =>
    calls.filter((call) => `${call.url.host}${call.url.pathname}` === hostPath);
  return { fetch, calls, callsTo };
}
