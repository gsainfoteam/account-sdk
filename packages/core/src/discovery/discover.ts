import { attemptAsync } from 'es-toolkit';

import { discoveryUrlOf, type IssuerInput } from './environments';
import { normalizeDiscovery, type AccountMetadata } from './normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../http/fetch';

export interface DiscoverOptions {
  /** 전역 `fetch` 대신 쓸 구현. 테스트나 `fetch` 가 없는 런타임용이다. */
  fetch?: Fetch;
  signal?: AbortSignal;
}

const cache = new Map<string, Promise<AccountMetadata>>();

/**
 * IdP 의 discovery 문서를 받아 정규화한다.
 *
 * 결과는 프로세스가 살아 있는 동안 issuer 별로 캐시하고, 동시에 들어온 호출은 요청 하나를 같이 쓴다.
 * 실패는 캐시하지 않는다. 일시적인 네트워크 오류가 페이지를 새로고침할 때까지 남아 있지 않게 하기 위해서다.
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

/** 캐시한 discovery 결과를 모두 지운다. */
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
