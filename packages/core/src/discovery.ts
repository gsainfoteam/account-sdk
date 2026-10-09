import * as z from 'zod/mini';

import { AccountError } from './errors';
import { parseScopes, type Scope } from './scopes';

export type Environment = 'production' | 'staging';

// IdP 는 `api.<host>` 에 API 를, `<host>` 에 로그인 화면(account-fe)을 둔다.
export const ENVIRONMENTS: Readonly<Record<Environment, string>> = {
  production: 'https://api.account.gistory.me',
  staging: 'https://api.stg.account.gistory.me',
};

// 환경 이름이나 IdP API origin 을 받는다.
export type IssuerInput = Environment | (string & {});

export type Fetch = typeof globalThis.fetch;

export interface AccountMetadata {
  // discovery 문서가 말하는 issuer
  issuer: string;
  // id_token `iss` 와 callback `iss` 검증에서 받아들이는 값들
  issuers: readonly string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  revocation: { endpoint: string; method: 'POST' | 'DELETE' };
  scopesSupported: readonly Scope[];
  idTokenSigningAlgs: readonly string[];
}

export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  scope_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  [key: string]: unknown;
}

const DiscoveryDocumentSchema: z.ZodMiniType<DiscoveryDocument> = z.looseObject({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  userinfo_endpoint: z.optional(z.url()),
  jwks_uri: z.url(),
  revocation_endpoint: z.optional(z.url()),
  scopes_supported: z.optional(z.array(z.string())),
  scope_supported: z.optional(z.array(z.string())),
  id_token_signing_alg_values_supported: z.optional(z.array(z.string())),
});

export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = Object.hasOwn(ENVIRONMENTS, issuer) ? ENVIRONMENTS[issuer as Environment] : issuer;
  return new URL('/.well-known/openid-configuration', base).toString();
}

// 지금 IdP discovery 문서의 결함을 여기서만 흡수한다. IdP 가 고쳐지면 이 함수만 단순해진다.
// - issuer 와 endpoint 들을 account-be 의 BASE_URL 로 만들어서, 스테이징은 `account.account.gistory.me` 처럼
//   존재하지 않는 호스트를 가리킨다. 그래서 문서를 실제로 받아 온 호스트를 기준으로 endpoint 를 다시 만든다.
// - id_token 의 iss 는 discovery 의 issuer 와 다른 env(JWT_ISSUER)에서 온다. 둘 다 IdP 가 가진 호스트이므로
//   API origin 과 로그인 화면 origin 을 모두 받아들인다.
// - `scopes_supported` 가 `scope_supported` 로 잘못 나간다.
// - 표준 revocation endpoint 대신 `DELETE /oauth/token` 을 쓴다.
// 같은 이유로 oauth4webapi 의 processDiscoveryResponse 는 쓸 수 없다. 문서의 issuer 가 요청한 URL 과
// 같아야 통과하기 때문이다.
export function normalizeDiscovery(input: unknown, fetchedFrom: string): AccountMetadata {
  const parsed = DiscoveryDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new AccountError('discovery_failed', {
      description: 'invalid discovery document',
      cause: parsed.error,
    });
  }
  const doc = parsed.data;

  const apiOrigin = new URL(fetchedFrom).origin;
  const frontOrigin = apiOrigin.replace('://api.', '://');
  const onApi = (endpoint: string): string =>
    new URL(new URL(endpoint).pathname, apiOrigin).toString();

  return {
    issuer: doc.issuer,
    issuers: [...new Set([doc.issuer, frontOrigin, apiOrigin])],
    authorizationEndpoint: new URL(
      new URL(doc.authorization_endpoint).pathname,
      frontOrigin,
    ).toString(),
    tokenEndpoint: onApi(doc.token_endpoint),
    userinfoEndpoint: onApi(doc.userinfo_endpoint ?? `${apiOrigin}/oauth/userinfo`),
    jwksUri: onApi(doc.jwks_uri),
    revocation: doc.revocation_endpoint
      ? { endpoint: onApi(doc.revocation_endpoint), method: 'POST' }
      : { endpoint: `${apiOrigin}/oauth/token`, method: 'DELETE' },
    scopesSupported: parseScopes(doc.scopes_supported ?? doc.scope_supported),
    idTokenSigningAlgs: doc.id_token_signing_alg_values_supported ?? ['ES256'],
  };
}

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
