import {
  CLIENT_SCOPES,
  CODE_CHALLENGE_METHOD,
  GRANT_TYPES,
  IDP_PAGE_PATHS,
  OPENID_SCOPE,
  SCOPE_CLAIMS,
  SCOPES,
  type ClientScope,
  type OAuthErrorCode,
  type TokenEndpointAuthMethod,
  type UserClaims,
} from '@gsainfoteam/account-contract';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import * as oauth from 'oauth4webapi';

import { fakeUser } from './fake-user';

export type FakeUser = { sub: string } & Partial<UserClaims>;

/**
 * `clients`를 하나도 주지 않으면 어떤 client id와 secret이든 받고, 그 client를 모든 scope를 필수로 등록한
 * `client_secret_post` client로 본다.
 */
export interface FakeClient {
  clientId: string;
  /** 값을 주면 token endpoint가 이 secret을 요구한다. */
  clientSecret?: string;
  scopes?: ClientScope[];
  optionalScopes?: ClientScope[];
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
}

export interface FakeIdpOptions {
  /**
   * client credentials 토큰으로 조회할 수 있는 사용자 목록이다. {@link FakeIdp.authorize} 한 사용자는 이 목록에
   * 저절로 들어간다.
   */
  users?: FakeUser[];
  clients?: FakeClient[];
}

export interface FakeAuthorizeOptions {
  clientId: string;
  user?: FakeUser;
  /** 기본값은 client에 등록한 scope 전부이고, client를 등록하지 않았으면 모든 scope다. */
  scopes?: readonly ClientScope[];
  redirectUri?: string;
  /** 초 단위다. */
  authTime?: number;
  /** 기본은 비밀번호 로그인(`["pwd"]`)이다. */
  amr?: string[];
}

export interface FakeLoginBody {
  code: string;
  code_verifier: string;
  redirect_uri: string;
  nonce: string;
}

export interface FakeIdp {
  /** issuer는 `'production'`이든 무엇이든 된다. */
  fetch: typeof globalThis.fetch;
  /** code는 한 번만 교환할 수 있고, PKCE와 nonce도 진짜 IdP처럼 확인한다. */
  authorize(options: FakeAuthorizeOptions): Promise<{ body: FakeLoginBody; user: FakeUser }>;
}

interface PendingCode {
  user: FakeUser;
  clientId: string;
  scopes: readonly ClientScope[];
  redirectUri: string;
  nonce: string;
  codeChallenge: string;
  authTime: number;
  amr: string[];
}

interface IssuedToken {
  clientId: string;
  scopes: readonly ClientScope[];
  user?: FakeUser;
}

const DEFAULT_REDIRECT_URI = 'https://service.example/auth/callback';
const ACCESS_TOKEN_TTL = 10_800;

export async function createFakeIdp(options: FakeIdpOptions = {}): Promise<FakeIdp> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'fake-idp', use: 'sig', alg: 'ES256' };

  const clients = new Map((options.clients ?? []).map((client) => [client.clientId, client]));
  const users = new Map((options.users ?? []).map((user) => [user.sub, user]));
  const codes = new Map<string, PendingCode>();
  const tokens = new Map<string, IssuedToken>();

  const registeredScopes = (clientId: string): readonly ClientScope[] => {
    const client = clients.get(clientId);
    return client ? [...(client.scopes ?? []), ...(client.optionalScopes ?? [])] : CLIENT_SCOPES;
  };

  const authenticate = (clientId: string, secret: string | null): boolean => {
    if (clients.size === 0) return true;

    const client = clients.get(clientId);
    return !!client && (client.clientSecret === undefined || client.clientSecret === secret);
  };

  const issueAccessToken = (token: IssuedToken): string => {
    const value = oauth.generateRandomState();
    tokens.set(value, token);
    return value;
  };

  const tokenEndpoint = async (request: Request): Promise<Response> => {
    const body = new URLSearchParams(await request.text());
    const [basicId, basicSecret] = basicCredentials(request.headers.get('authorization'));
    const clientId = body.get('client_id') ?? basicId;
    const secret = body.get('client_secret') ?? basicSecret;

    if (!clientId || !authenticate(clientId, secret)) return oauthError('invalid_client', 401);

    if (body.get('grant_type') === 'client_credentials') {
      const scopes = parseScopes(body.get('scope'));
      return Response.json({
        access_token: issueAccessToken({ clientId, scopes }),
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        scope: scopes.join(' '),
      });
    }
    if (!body.has('grant_type')) return oauthError('invalid_request', 400);
    if (body.get('grant_type') !== 'authorization_code')
      return oauthError('unsupported_grant_type', 400);

    const pending = codes.get(body.get('code') ?? '');
    codes.delete(body.get('code') ?? '');

    const verifier = body.get('code_verifier') ?? '';
    const valid =
      pending?.clientId === clientId &&
      pending.redirectUri === body.get('redirect_uri') &&
      pending.codeChallenge === (await oauth.calculatePKCECodeChallenge(verifier));
    if (!pending || !valid) return oauthError('invalid_grant', 400);

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({
      ...claimsOf(pending.user, pending.scopes),
      nonce: pending.nonce,
      auth_time: pending.authTime,
      amr: pending.amr,
      scope: [OPENID_SCOPE, ...pending.scopes].join(' '),
    })
      .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
      .setIssuer(frontOrigin(new URL(request.url).origin))
      .setSubject(pending.user.sub)
      .setAudience(pending.clientId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    return Response.json({
      access_token: issueAccessToken({
        clientId: pending.clientId,
        scopes: pending.scopes,
        user: pending.user,
      }),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      scope: [OPENID_SCOPE, ...pending.scopes].join(' '),
      id_token: idToken,
    });
  };

  const userinfoEndpoint = (request: Request, url: URL): Response => {
    const token = tokens.get(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');
    if (!token) return new Response(null, { status: 401 });

    const user = token.user ?? users.get(url.searchParams.get('sub') ?? '');
    if (!user) return Response.json({ statusCode: 404, message: 'Not Found' }, { status: 404 });

    return Response.json({ sub: user.sub, ...claimsOf(user, token.scopes) });
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/.well-known/openid-configuration') return Response.json(discovery(url.origin));
    if (path === '/oauth/certs') return Response.json({ keys: [jwk] });
    if (path === '/oauth/token' && request.method === 'POST') return tokenEndpoint(request);
    if (path === '/oauth/userinfo') return userinfoEndpoint(request, url);
    if (path === '/oauth/revoke') return new Response(null, { status: 200 });

    const registered = /^\/client\/([^/]+)\/public$/.exec(path)?.[1];
    if (registered) {
      const clientId = decodeURIComponent(registered);
      const client =
        clients.size === 0 ? { clientId, scopes: [...CLIENT_SCOPES] } : clients.get(clientId);
      if (!client) return Response.json({ statusCode: 404 }, { status: 404 });

      return Response.json({
        clientId: client.clientId,
        scopes: client.scopes ?? [],
        optionalScopes: client.optionalScopes ?? [],
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod ?? 'client_secret_post',
      });
    }

    return new Response('not found', { status: 404 });
  };

  return {
    fetch,

    async authorize({ user = fakeUser(), ...authorizeOptions }) {
      const code = oauth.generateRandomState();
      const codeVerifier = oauth.generateRandomCodeVerifier();
      const nonce = oauth.generateRandomNonce();
      const redirectUri = authorizeOptions.redirectUri ?? DEFAULT_REDIRECT_URI;

      users.set(user.sub, user);
      codes.set(code, {
        user,
        clientId: authorizeOptions.clientId,
        scopes: authorizeOptions.scopes ?? registeredScopes(authorizeOptions.clientId),
        redirectUri,
        nonce,
        codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
        authTime: authorizeOptions.authTime ?? Math.floor(Date.now() / 1000),
        amr: authorizeOptions.amr ?? ['pwd'],
      });

      return {
        body: { code, code_verifier: codeVerifier, redirect_uri: redirectUri, nonce },
        user,
      };
    },
  };
}

function claimsOf(user: FakeUser, scopes: readonly ClientScope[]): Record<string, unknown> {
  return Object.fromEntries(
    scopes
      .flatMap((scope) => SCOPE_CLAIMS[scope])
      .flatMap((claim) => (user[claim] === undefined ? [] : [[claim, user[claim]]])),
  );
}

function parseScopes(value: string | null): ClientScope[] {
  const known: readonly string[] = CLIENT_SCOPES;
  return (value?.split(' ') ?? []).filter((scope): scope is ClientScope => known.includes(scope));
}

function basicCredentials(header: string | null): [string | null, string | null] {
  if (!header?.startsWith('Basic ')) return [null, null];

  const [id, secret] = atob(header.slice('Basic '.length)).split(':');
  return [id ? decodeURIComponent(id) : null, secret ? decodeURIComponent(secret) : null];
}

function oauthError(error: OAuthErrorCode, status: number): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}

/** 진짜 IdP처럼 issuer와 브라우저용 endpoint는 `api.`를 뺀 로그인 페이지 host에 둔다. */
function frontOrigin(apiOrigin: string): string {
  return apiOrigin.replace('://api.', '://');
}

function discovery(apiOrigin: string) {
  const front = frontOrigin(apiOrigin);

  return {
    issuer: front,
    authorization_endpoint: `${front}${IDP_PAGE_PATHS.authorize}`,
    end_session_endpoint: `${front}${IDP_PAGE_PATHS.logout}`,
    token_endpoint: `${apiOrigin}/oauth/token`,
    userinfo_endpoint: `${apiOrigin}/oauth/userinfo`,
    jwks_uri: `${apiOrigin}/oauth/certs`,
    revocation_endpoint: `${apiOrigin}/oauth/revoke`,
    scopes_supported: SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: GRANT_TYPES,
    id_token_signing_alg_values_supported: ['ES256'],
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
  };
}
