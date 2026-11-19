import { AUTHORIZATION_HEADER, bearer, isUnauthorized, type Fetch } from '@infoteam/account-core';

interface AuthorizedFetchContext {
  tokenOrigins: Set<string>;
  fetch: Fetch | undefined;
  ready: () => Promise<void>;
  getAccessToken: () => string | null;
  refresh: (staleToken: string) => Promise<string | null>;
}

export function authorizedFetch(context: AuthorizedFetchContext): Fetch {
  const base = context.fetch ?? ((input, init) => globalThis.fetch(input, init));

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (!context.tokenOrigins.has(url.origin)) return base(input, init);

    await context.ready();

    const send = (token: string | null): Promise<Response> => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (token) headers.set(AUTHORIZATION_HEADER, bearer(token));

      const request = input instanceof Request ? input.clone() : input;
      return base(request, { ...init, headers });
    };

    const token = context.getAccessToken();
    const response = await send(token);
    // 토큰 없이 받은 401은 refresh로 바뀌지 않고, stream body는 한 번 읽으면 다시 보낼 수 없다.
    const retryable = token !== null && !(init?.body instanceof ReadableStream);
    if (!retryable || !isUnauthorized(response.status)) return response;

    const refreshed = await context.refresh(token);
    return refreshed ? send(refreshed) : response;
  };
}
