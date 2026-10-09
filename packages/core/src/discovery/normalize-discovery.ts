import * as z from 'zod/mini';

import { API_HOST_PREFIX, DEFAULT_ID_TOKEN_SIGNING_ALGS, FALLBACK_ENDPOINTS } from '../constants';
import { parse } from '../internal/validate';

export interface AccountMetadata {
  issuer: string;
  issuers: readonly string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  revocation: { endpoint: string; method: 'POST' | 'DELETE' };
  scopesSupported: readonly string[];
  idTokenSigningAlgs: readonly string[];
}

export const DiscoveryDocumentSchema = z.looseObject({
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

export type DiscoveryDocument = z.infer<typeof DiscoveryDocumentSchema>;

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
  const doc = parse(DiscoveryDocumentSchema, input, 'discovery_failed', 'discovery document');

  const apiOrigin = new URL(fetchedFrom).origin;
  const frontOrigin = apiOrigin.replace(`://${API_HOST_PREFIX}`, '://');
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
    userinfoEndpoint: onApi(
      doc.userinfo_endpoint ?? new URL(FALLBACK_ENDPOINTS.userinfo, apiOrigin).toString(),
    ),
    jwksUri: onApi(doc.jwks_uri),
    revocation: doc.revocation_endpoint
      ? { endpoint: onApi(doc.revocation_endpoint), method: 'POST' }
      : {
          endpoint: new URL(FALLBACK_ENDPOINTS.revocation, apiOrigin).toString(),
          method: 'DELETE',
        },
    scopesSupported: doc.scopes_supported ?? doc.scope_supported ?? [],
    idTokenSigningAlgs: doc.id_token_signing_alg_values_supported ?? DEFAULT_ID_TOKEN_SIGNING_ALGS,
  };
}
