import { type Fetch } from './discovery';
import { base64UrlDecode, utf8 } from './encoding';
import { AccountError } from './errors';

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  auth_time?: number;
  scope?: string;
  name?: string;
  profile?: string | null;
  picture?: string | null;
  email?: string;
  student_id?: string;
  phone_number?: string;
  [claim: string]: unknown;
}

export interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  [field: string]: unknown;
}

export interface JwksSource {
  getKey(kid: string | undefined, alg: string): Promise<CryptoKey>;
}

const ALGORITHMS = {
  ES256: {
    import: { name: 'ECDSA', namedCurve: 'P-256' },
    verify: { name: 'ECDSA', hash: 'SHA-256' },
  },
  RS256: {
    import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verify: { name: 'RSASSA-PKCS1-v1_5' },
  },
} as const satisfies Record<
  string,
  {
    import: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams;
    verify: AlgorithmIdentifier | EcdsaParams;
  }
>;

type Algorithm = keyof typeof ALGORITHMS;

function isAlgorithm(value: unknown): value is Algorithm {
  return typeof value === 'string' && Object.hasOwn(ALGORITHMS, value);
}

export interface RemoteJwksOptions {
  fetch?: Fetch;
  // 모르는 kid 를 만났을 때 다시 받아 오는 최소 간격. 위조 토큰으로 IdP 를 두드리지 못하게 한다.
  cooldownMs?: number;
}

export function createRemoteJwks(jwksUri: string, options: RemoteJwksOptions = {}): JwksSource {
  const { fetch = globalThis.fetch, cooldownMs = 30_000 } = options;
  let keys: Promise<Jwk[]> | undefined;
  let fetchedAt = 0;
  const imported = new Map<string, Promise<CryptoKey>>();

  const load = (): Promise<Jwk[]> => {
    fetchedAt = Date.now();
    imported.clear();
    keys = fetchJwks(jwksUri, fetch);
    keys.catch(() => {
      keys = undefined;
    });
    return keys;
  };

  return {
    async getKey(kid, alg) {
      let jwk = pick(await (keys ?? load()), kid, alg);
      if (!jwk && Date.now() - fetchedAt >= cooldownMs) {
        jwk = pick(await load(), kid, alg);
      }
      if (!jwk)
        throw new AccountError('invalid_id_token', {
          description: `no key for kid ${kid ?? '(none)'}`,
        });

      const cacheKey = `${jwk.kid ?? ''}:${alg}`;
      let key = imported.get(cacheKey);
      if (!key) {
        key = importJwk(jwk, alg as Algorithm);
        imported.set(cacheKey, key);
      }
      return key;
    },
  };
}

export function createLocalJwks(jwks: { keys: Jwk[] }): JwksSource {
  return {
    async getKey(kid, alg) {
      const jwk = pick(jwks.keys, kid, alg);
      if (!jwk)
        throw new AccountError('invalid_id_token', {
          description: `no key for kid ${kid ?? '(none)'}`,
        });
      return importJwk(jwk, alg as Algorithm);
    },
  };
}

function pick(keys: Jwk[], kid: string | undefined, alg: string): Jwk | undefined {
  const usable = keys.filter(
    (key) => (key.use ?? 'sig') === 'sig' && (!key.alg || key.alg === alg),
  );
  if (kid) return usable.find((key) => key.kid === kid);
  return usable.length === 1 ? usable[0] : undefined;
}

async function fetchJwks(jwksUri: string, fetch: Fetch): Promise<Jwk[]> {
  let response: Response;
  try {
    response = await fetch(jwksUri, { headers: { accept: 'application/json' } });
  } catch (cause) {
    throw new AccountError('network_error', { description: `GET ${jwksUri}`, cause });
  }
  if (!response.ok) {
    throw new AccountError('server_error', {
      description: `GET ${jwksUri}`,
      status: response.status,
    });
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

function importJwk(jwk: Jwk, alg: Algorithm): Promise<CryptoKey> {
  // key_ops 나 ext 가 verify 와 어긋나면 importKey 가 거절하므로 키 재료만 넘긴다.
  const { kid: _kid, use: _use, key_ops: _ops, ext: _ext, ...material } = jwk;
  return crypto.subtle.importKey('jwk', material as JsonWebKey, ALGORITHMS[alg].import, false, [
    'verify',
  ]);
}

export interface VerifyIdTokenOptions {
  jwks: JwksSource;
  issuers: readonly string[];
  audience: string;
  // authorize 요청에 보낸 nonce. 넘기면 반드시 일치해야 한다.
  nonce?: string;
  algorithms?: readonly string[];
  clockToleranceSec?: number;
  now?: () => number;
}

export async function verifyIdToken(
  token: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw invalid('malformed token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

  const header = decodeJson(encodedHeader) as { alg?: unknown; kid?: unknown };
  const allowed = options.algorithms ?? ['ES256'];
  if (!isAlgorithm(header.alg) || !allowed.includes(header.alg)) {
    throw invalid(`unsupported alg ${String(header.alg)}`);
  }
  const alg = header.alg;

  const key = await options.jwks.getKey(
    typeof header.kid === 'string' ? header.kid : undefined,
    alg,
  );
  const valid = await crypto.subtle.verify(
    ALGORITHMS[alg].verify,
    key,
    base64UrlDecode(encodedSignature),
    utf8(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw invalid('bad signature');

  const claims = decodeJson(encodedPayload) as IdTokenClaims;
  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const tolerance = options.clockToleranceSec ?? 60;

  if (!options.issuers.includes(claims.iss)) throw invalid(`unexpected iss ${claims.iss}`);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) throw invalid('unexpected aud');
  if (typeof claims.exp !== 'number' || claims.exp + tolerance < now) throw invalid('expired');
  if (typeof claims.iat === 'number' && claims.iat - tolerance > now)
    throw invalid('issued in the future');
  if (options.nonce !== undefined && claims.nonce !== options.nonce)
    throw invalid('nonce mismatch');
  if (typeof claims.sub !== 'string' || !claims.sub) throw invalid('missing sub');

  return claims;
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  } catch (cause) {
    throw new AccountError('invalid_id_token', { description: 'malformed token', cause });
  }
}

function invalid(description: string): AccountError {
  return new AccountError('invalid_id_token', { description });
}
