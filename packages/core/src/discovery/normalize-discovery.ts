import { uniq } from 'es-toolkit';
import * as z from 'zod/mini';

import { API_HOST_PREFIX, DEFAULT_ID_TOKEN_SIGNING_ALGS, FALLBACK_ENDPOINTS } from '../constants';
import { parse } from '../internal/validate';

/** OpenID discovery 문서에서 정규화한 IdP 의 endpoint 와 기능. */
export interface AccountMetadata {
  /** discovery 문서에 적힌 `issuer`. */
  issuer: string;
  /**
   * callback 의 `iss` 파라미터와 id_token 의 `iss` claim 으로 받아들이는 issuer 값.
   *
   * account-be 는 광고하는 값과 다른 설정으로 id_token 에 서명한다. 그래서 SDK 는 IdP 가 가진 호스트를
   * 모두 받아들인다. 광고된 issuer, 로그인 호스트, API 호스트다.
   */
  issuers: readonly string[];
  /** authorization code 흐름을 시작하는 account-fe 의 로그인 페이지. */
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  /**
   * 토큰을 폐기할 위치와 방법.
   *
   * account-be 는 RFC 7009 의 revocation endpoint `POST` 대신 `DELETE /oauth/token` 으로 폐기한다.
   * IdP 가 `revocation_endpoint` 를 광고하면 표준 요청으로 바뀐다.
   */
  revocation: { endpoint: string; method: 'POST' | 'DELETE' };
  /**
   * IdP 세션까지 끝내는 account-fe 의 로그아웃 페이지(OpenID Connect RP-Initiated Logout).
   * IdP 가 아직 광고하지 않으면 없다.
   */
  endSessionEndpoint: string | undefined;
  /** IdP 가 광고하는 scope. SDK 가 아직 모르는 scope 도 보이도록 받은 그대로 둔다. */
  scopesSupported: readonly string[];
  idTokenSigningAlgs: readonly string[];
}

/** IdP 가 제공하는 OpenID discovery 문서의 모양. */
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
 * discovery 문서와 그 문서를 받아 온 URL 로 {@link AccountMetadata} 를 만든다.
 *
 * @remarks
 * IdP discovery 문서의 결함을 보정하는 곳은 여기 하나뿐이다.
 * - account-be 는 issuer 와 endpoint 를 `BASE_URL` 로 만드는데, 스테이징에서는 이 값이 존재하지 않는 호스트
 *   `account.account.gistory.me` 를 가리킨다. 그래서 endpoint 를 문서를 실제로 받아 온 호스트 기준으로 다시 만든다.
 *   API endpoint 는 `api.<host>`, 로그인 페이지는 `<host>` 다.
 * - id_token 의 `iss` 는 별도 설정에서 오므로, IdP 가 가진 호스트를 모두 받아들인다.
 * - 지원 scope 가 `scopes_supported` 가 아니라 `scope_supported` 로 나간다.
 * - 폐기가 표준 revocation endpoint 가 아니라 `DELETE /oauth/token` 이다.
 *
 * 같은 이유로 oauth4webapi 의 `processDiscoveryResponse` 는 쓸 수 없다. 문서의 issuer 가 요청한 URL 과 같아야 하기
 * 때문이다. IdP 가 고쳐지면 이 규칙들은 아무 일도 하지 않게 된다.
 *
 * @throws {@link AccountError} 문서가 {@link DiscoveryDocumentSchema} 와 맞지 않으면 `discovery_failed`.
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
