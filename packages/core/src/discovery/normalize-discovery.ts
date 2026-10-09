import { uniq } from 'es-toolkit';
import * as z from 'zod/mini';

import { API_HOST_PREFIX, DEFAULT_ID_TOKEN_SIGNING_ALGS, FALLBACK_ENDPOINTS } from '../constants';
import { parse } from '../internal/validate';

/** IdP endpoints and capabilities, normalized from its OpenID discovery document. */
export interface AccountMetadata {
  /** The `issuer` the discovery document states. */
  issuer: string;
  /**
   * Issuer values accepted in a callback `iss` parameter and in an id_token `iss` claim.
   *
   * account-be signs id_tokens with a different setting than the one it advertises, so the SDK accepts
   * every host the IdP owns: the advertised issuer, the login host and the API host.
   */
  issuers: readonly string[];
  /** Login page on account-fe that starts the authorization code flow. */
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  /**
   * Where and how to revoke a token.
   *
   * account-be revokes with `DELETE /oauth/token` instead of the RFC 7009 `POST` to a revocation endpoint.
   * Once the IdP advertises `revocation_endpoint` this switches to the standard request.
   */
  revocation: { endpoint: string; method: 'POST' | 'DELETE' };
  /** Scopes the IdP advertises, kept as received so scopes the SDK does not know yet still show up. */
  scopesSupported: readonly string[];
  idTokenSigningAlgs: readonly string[];
}

/** Shape of the OpenID discovery document the IdP serves. */
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

/**
 * Builds {@link AccountMetadata} from a discovery document and the URL it was fetched from.
 *
 * @remarks
 * This is the only place that works around defects in the IdP's discovery document:
 * - account-be derives the issuer and endpoints from its `BASE_URL`, and on staging that points to
 *   `account.account.gistory.me`, a host that does not exist. Endpoints are rebuilt on the host the
 *   document was actually fetched from: API endpoints on `api.<host>` and the login page on `<host>`.
 * - id_tokens carry an `iss` from a separate setting, so every host the IdP owns is accepted.
 * - The supported scopes are advertised as `scope_supported` instead of `scopes_supported`.
 * - Revocation is `DELETE /oauth/token` instead of a standard revocation endpoint.
 *
 * For the same reasons `processDiscoveryResponse` from oauth4webapi cannot be used: it requires the
 * document's issuer to equal the URL that was requested. When the IdP is fixed these rules become no-ops.
 *
 * @throws {@link AccountError} `discovery_failed` when the document does not match {@link DiscoveryDocumentSchema}.
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

    scopesSupported: doc.scopes_supported ?? doc.scope_supported ?? [],
    idTokenSigningAlgs: doc.id_token_signing_alg_values_supported ?? DEFAULT_ID_TOKEN_SIGNING_ALGS,
  };
}
