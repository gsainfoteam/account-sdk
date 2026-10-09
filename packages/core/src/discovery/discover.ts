import { discoveryUrlOf, type IssuerInput } from './environments';
import { normalizeDiscovery, type AccountMetadata } from './normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type Fetch } from '../http/fetch';

export interface DiscoverOptions {
  /** Replaces the global `fetch`, for tests or a runtime without one. */
  fetch?: Fetch;
  signal?: AbortSignal;
}

const cache = new Map<string, Promise<AccountMetadata>>();

/**
 * Fetches and normalizes the IdP's discovery document.
 *
 * Results are cached per issuer for the life of the process, and concurrent calls share one request.
 * A failure is not cached, so a transient network error does not stick until the page is reloaded.
 *
 * @throws {@link AccountError} `network_error` or `discovery_failed`.
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

/** Forgets every cached discovery result. */
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
