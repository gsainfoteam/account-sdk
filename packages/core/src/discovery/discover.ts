import { discoveryUrlOf, type IssuerInput } from './environments';
import { normalizeDiscovery, type AccountMetadata } from './normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../internal/http';

export interface DiscoverOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}

const cache = new Map<string, Promise<AccountMetadata>>();

export function discover(
  issuer: IssuerInput,
  options: DiscoverOptions = {},
): Promise<AccountMetadata> {
  const url = discoveryUrlOf(issuer);
  const cached = cache.get(url);
  if (cached) return cached;

  const pending = fetchDiscovery(url, options);
  cache.set(url, pending);
  // 실패를 캐시하면 일시적인 네트워크 오류가 페이지를 새로 고칠 때까지 남는다.
  pending.catch(() => cache.delete(url));
  return pending;
}

export function clearDiscoveryCache(): void {
  cache.clear();
}

async function fetchDiscovery(
  url: string,
  { fetch = globalThis.fetch, signal }: DiscoverOptions,
): Promise<AccountMetadata> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  } catch (cause) {
    throw new AccountError('network_error', { description: `GET ${url}`, cause });
  }
  if (!response.ok) {
    throw new AccountError('discovery_failed', {
      description: `GET ${url}`,
      status: response.status,
    });
  }
  let doc: unknown;
  try {
    doc = await response.json();
  } catch (cause) {
    throw new AccountError('discovery_failed', { description: `${url} is not JSON`, cause });
  }
  return normalizeDiscovery(doc, url);
}
