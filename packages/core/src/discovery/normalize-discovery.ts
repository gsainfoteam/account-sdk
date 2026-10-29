import { uniq } from 'es-toolkit';
import * as z from 'zod/mini';

import { API_HOST_PREFIX, DEFAULT_ID_TOKEN_SIGNING_ALGS, FALLBACK_ENDPOINTS } from '../constants';
import { parse } from '../internal/validate';

export interface AccountMetadata {
  issuer: string;
  /** account-be는 discovery 문서에 실은 값과 다른 설정으로 id_token에 서명하므로, IdP가 가진 호스트를 모두 받아들인다. */
  issuers: readonly string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  /**
   * account-be는 RFC 7009의 `POST` 대신 `DELETE /oauth/token`으로 폐기한다.
   * `revocation_endpoint`를 discovery 문서에 실으면 표준 요청으로 바뀐다.
   */
  revocation: { endpoint: string; method: 'POST' | 'DELETE' };
  endSessionEndpoint: string | undefined;
  /** SDK가 아직 모르는 scope도 보이도록 받은 그대로 둔다. */
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
  end_session_endpoint: z.optional(z.url()),
  scopes_supported: z.optional(z.array(z.string())),
  scope_supported: z.optional(z.array(z.string())),
  id_token_signing_alg_values_supported: z.optional(z.array(z.string())),
});

export type DiscoveryDocument = z.infer<typeof DiscoveryDocumentSchema>;

/**
 * IdP discovery 문서의 결함을 보정하는 곳은 여기 하나뿐이다. IdP의 결함이 고쳐지면 이 규칙들은 아무 일도 하지 않게 된다.
 * - 스테이징의 `BASE_URL`은 존재하지 않는 호스트 `account.account.gistory.me`를 가리킨다. 그래서 endpoint는
 *   문서를 실제로 받아 온 호스트를 기준으로 다시 만든다. API endpoint는 `api.<host>`, 로그인 페이지는 `<host>`다.
 * - 지원 scope가 `scopes_supported`가 아니라 `scope_supported`로 나간다.
 *
 * 같은 이유로 oauth4webapi의 `processDiscoveryResponse`는 쓸 수 없다. 문서의 issuer가 요청한 URL과 같아야 하기
 * 때문이다.
 */
export function normalizeDiscovery(input: unknown, fetchedFrom: string): AccountMetadata {
  const doc = parse(DiscoveryDocumentSchema, input, 'discovery_failed', 'discovery document');

  const apiOrigin = new URL(fetchedFrom).origin;
  const frontOrigin = apiOrigin.replace(`://${API_HOST_PREFIX}`, '://');

  const pathOf = (endpoint: string): string => new URL(endpoint).pathname;
  const onApi = (path: string): string => new URL(path, apiOrigin).toString();
  const onFront = (path: string): string => new URL(path, frontOrigin).toString();

  return {
    issuer: doc.issuer,
    issuers: uniq([doc.issuer, frontOrigin, apiOrigin]),

    authorizationEndpoint: onFront(pathOf(doc.authorization_endpoint)),
    tokenEndpoint: onApi(pathOf(doc.token_endpoint)),
    userinfoEndpoint: onApi(
      doc.userinfo_endpoint ? pathOf(doc.userinfo_endpoint) : FALLBACK_ENDPOINTS.userinfo,
    ),
    jwksUri: onApi(pathOf(doc.jwks_uri)),
    revocation: doc.revocation_endpoint
      ? { endpoint: onApi(pathOf(doc.revocation_endpoint)), method: 'POST' }
      : { endpoint: onApi(FALLBACK_ENDPOINTS.revocation), method: 'DELETE' },
    endSessionEndpoint: doc.end_session_endpoint
      ? onFront(pathOf(doc.end_session_endpoint))
      : undefined,

    scopesSupported: doc.scopes_supported ?? doc.scope_supported ?? [],
    idTokenSigningAlgs: doc.id_token_signing_alg_values_supported ?? DEFAULT_ID_TOKEN_SIGNING_ALGS,
  };
}
