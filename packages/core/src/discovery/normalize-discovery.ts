import * as z from 'zod/mini';

import { parse } from '../internal/validate';

export interface AccountMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  revocationEndpoint: string;
  endSessionEndpoint: string | undefined;
  /** SDK가 아직 모르는 scope도 보이도록 받은 그대로 둔다. */
  scopesSupported: readonly string[];
  idTokenSigningAlgs: readonly string[];
}

export const DiscoveryDocumentSchema = z.looseObject({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  userinfo_endpoint: z.url(),
  jwks_uri: z.url(),
  revocation_endpoint: z.url(),
  end_session_endpoint: z.optional(z.url()),
  scopes_supported: z.optional(z.array(z.string())),
  id_token_signing_alg_values_supported: z.array(z.string()),
});

export type DiscoveryDocument = z.infer<typeof DiscoveryDocumentSchema>;

/** oauth4webapi의 `processDiscoveryResponse`는 쓸 수 없다. 문서는 `api.` 호스트에서 받는데 issuer는 로그인 페이지 호스트여서다. */
export function normalizeDiscovery(input: unknown): AccountMetadata {
  const doc = parse(DiscoveryDocumentSchema, input, 'discovery_failed', 'discovery document');

  return {
    issuer: doc.issuer,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    userinfoEndpoint: doc.userinfo_endpoint,
    jwksUri: doc.jwks_uri,
    revocationEndpoint: doc.revocation_endpoint,
    endSessionEndpoint: doc.end_session_endpoint,
    scopesSupported: doc.scopes_supported ?? [],
    idTokenSigningAlgs: doc.id_token_signing_alg_values_supported,
  };
}
