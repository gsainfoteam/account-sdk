import { attempt, isString, trimEnd } from 'es-toolkit';

import { type AccountClientOptions } from '../client/options';

const SCHEME_RELATIVE_SLASHES = /^\/{2,}/;

export function sameOriginPath(value: string): string | undefined {
  const [, url] = attempt(() => new URL(value, window.location.origin));
  if (url?.origin !== window.location.origin) return undefined;

  return url.pathname.replace(SCHEME_RELATIVE_SLASHES, '/') + url.search + url.hash;
}

export function samePath(a: string, b: string): boolean {
  return trimEnd(a, '/') === trimEnd(b, '/');
}

export function apiOrigin(api: AccountClientOptions['api']): string {
  if (api === undefined) return window.location.origin;

  return isString(api) ? api : api.baseUrl;
}
