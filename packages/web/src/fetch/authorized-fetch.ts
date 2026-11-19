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
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.document.baseURI,
    );
    if (!context.tokenOrigins.has(url.origin)) {
      return base(input instanceof Request ? input : url.href, init);
    }

    await context.ready();

    const send = (token: string | null): Promise<Response> => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (token) headers.set(AUTHORIZATION_HEADER, bearer(token));

      const bodyReplaced = init?.body != null;
      const request = input instanceof Request ? (bodyReplaced ? input : input.clone()) : url.href;
      return base(request, { ...init, headers });
    };

    const token = context.getAccessToken();
    const response = await send(token);
    const sentToken = token !== null;
    const initBodyIsStream = init?.body instanceof ReadableStream;
    if (!sentToken || initBodyIsStream || !isUnauthorized(response.status)) return response;

    const refreshed = await context.refresh(token);
    return refreshed ? send(refreshed) : response;
  };
}
