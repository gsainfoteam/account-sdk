import { attempt, isString, trimEnd } from 'es-toolkit';

import { type AccountClientOptions } from '../client/options';

export function sameOriginPath(value: string): string | undefined {
  const [, url] = attempt(() => new URL(value, window.location.origin));
  if (url?.origin !== window.location.origin) return undefined;

  // `//evil.com/x`는 scheme-relative URL이라 문서 이동에서 다른 origin으로 간다.
  return url.pathname.replace(/^\/{2,}/, '/') + url.search + url.hash;
}

/** 정적 호스팅은 `/auth/callback`을 `/auth/callback/`로 리다이렉트하기도 한다. */
export function samePath(a: string, b: string): boolean {
  return trimEnd(a, '/') === trimEnd(b, '/');
}

export function apiOrigin(api: AccountClientOptions['api']): string {
  if (api === undefined) return window.location.origin;

  return isString(api) ? api : api.baseUrl;
}
