import { attemptAsync } from 'es-toolkit';

import { discoveryUrlOf, type IssuerInput } from './environments';
import { normalizeDiscovery, type AccountMetadata } from './normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../http/fetch';

export interface DiscoverOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}

const cache = new Map<string, Promise<AccountMetadata>>();

/**
 * 결과는 프로세스가 실행되는 동안 issuer별로 캐시한다.
 * 실패한 결과는 캐시하지 않는다. 일시적인 네트워크 오류가 페이지를 새로고침할 때까지 남아 있지 않게 하기 위해서다.
 *
 * @throws {@link AccountError} `network_error` 또는 `discovery_failed`.
 */
export function discover(
  issuer: IssuerInput,
  options: DiscoverOptions = {},
): Promise<AccountMetadata> {
  const url = discoveryUrlOf(issuer);
  const cached = cache.get(url);
  if (cached) return cached;

  const pending = fetchDiscovery(url, options);
  cache.set(url, pending);
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
  const [networkError, response] = await attemptAsync(() =>
    fetch(url, { headers: { accept: 'application/json' }, signal }),
  );

  if (!response) {
    throw new AccountError('network_error', { description: `GET ${url}`, cause: networkError });
  }

  if (!response.ok) {
    throw new AccountError('discovery_failed', {
      description: `GET ${url}`,
      status: response.status,
    });
  }

  const [parseError, doc] = await attemptAsync<unknown>(() => response.json());
  if (parseError) {
    throw new AccountError('discovery_failed', {
      description: `${url} is not JSON`,
      cause: parseError,
    });
  }

  return normalizeDiscovery(doc, url);
}
