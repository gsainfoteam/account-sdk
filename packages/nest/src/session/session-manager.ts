import { createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';

import {
  AccountError,
  parseIdTokenClaims,
  userInfoFromIdToken,
  type ClientScope,
  type IdTokenClaims,
  type UserInfo,
} from '@gsainfoteam/account-core';
import { type AccountServer } from '@gsainfoteam/account-server';
import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from 'jose';
import * as z from 'zod/mini';

import { JsonObjectSchema, type SessionStore } from './session-store';

export type ClaimsSchema<Claims extends Record<string, unknown>> = z.core.$ZodType<Claims>;

export type ResolvedSession<Claims extends Record<string, unknown>> = {
  subject: string;
} & (keyof Claims extends never ? { claims?: Claims } : { claims: Claims });

/**
 * `auth_time`(초)과 `amr`은 refresh 해도 처음 IdP에 로그인했을 때의 값을 유지한다. IdP가 이 값을 기록하기 전에
 * 이루어진 로그인에는 두 값이 없다.
 */
export type Session<Claims extends Record<string, unknown> = Record<never, never>> = {
  sub: string;
  sid: string;
  auth_time?: number;
  amr?: string[];
} & Claims;

export interface SessionModuleOptions<
  RequiredScope extends ClientScope,
  Claims extends Record<string, unknown>,
> {
  /** 32자 이상이어야 한다. access token 서명 키와 ticket 암호화 키를 이 값에서 유도한다. */
  secret: string;
  store: SessionStore;
  /**
   * `body`는 로그인 요청에서 프로토콜 필드를 뺀 나머지다. 로그인 전에 사용자에게 더 받을 것이 있으면(약관 동의 같은
   * 것) {@link SessionRejected}를 던진다.
   */
  resolve(
    user: UserInfo<RequiredScope>,
    context: { body: Record<string, unknown> },
  ): ResolvedSession<Claims> | Promise<ResolvedSession<Claims>>;
  /** 초 단위다. 기본값은 15분이다. */
  accessTtl?: number;
  /** 초 단위다. 토큰을 교체할 때마다 다시 센다. 기본값은 30일이다. */
  refreshTtl?: number;
  /** `replace`면 로그인할 때 같은 subject의 다른 세션을 모두 끝낸다. 기본값은 `add`다. */
  onLogin?: 'add' | 'replace';
  /** 기본값은 `refresh_token`, `HttpOnly`, `Secure`, `SameSite=Strict`이다. */
  cookie?: {
    name?: string;
    sameSite?: 'strict' | 'lax' | 'none';
    secure?: boolean;
    domain?: string;
  };
}

/**
 * `resolve`에서 이 에러를 던지면 로그인을 거절한다. 클라이언트는 403과 함께 `details`와 ticket을 받고,
 * `retryLogin(body)`로 추가 입력을 보내면 같은 사용자로 `resolve`가 다시 불린다.
 */
export class SessionRejected extends Error {
  override readonly name = 'SessionRejected';

  constructor(readonly details?: unknown) {
    super('session rejected');
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** 초 단위다. */
  expiresIn: number;
  /** 초 단위다. 쿠키의 `Max-Age`다. */
  refreshExpiresIn: number;
}

export type LoginResult =
  { tokens: IssuedTokens } | { rejected: { ticket: string; details: unknown } };

export interface SessionManager<Claims extends Record<string, unknown>> {
  login(body: unknown): Promise<LoginResult>;
  refresh(refreshToken: string | undefined): Promise<IssuedTokens | null>;
  logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void>;
  verify(accessToken: string): Promise<Session<Claims> | null>;
}

const DEFAULT_ACCESS_TTL = 15 * 60;
const DEFAULT_REFRESH_TTL = 30 * 24 * 60 * 60;
const TICKET_TTL = '5m';
/**
 * 이미 쓰인 refresh token을 이 시간 안에 다시 받으면 새 토큰을 준다. 탭 두 개가 같은 쿠키로 동시에 refresh 하는 일이
 * 흔해서, 이를 재사용으로 보면 사용자가 로그아웃된다.
 */
const REUSE_GRACE_MS = 10_000;
const PROTOCOL_FIELDS = new Set([
  'code',
  'code_verifier',
  'redirect_uri',
  'nonce',
  'iss',
  'ticket',
  'transport',
]);

const TicketBodySchema = z.object({ ticket: z.string() });
const CodeBodySchema = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  nonce: z.string(),
  iss: z.optional(z.string()),
});

type Credential = z.output<typeof TicketBodySchema> | z.output<typeof CodeBodySchema>;

const SessionOptionsSchema = z.looseObject({
  secret: z.string().check(z.minLength(32)),
  store: z.looseObject({}),
  resolve: z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function'),
});

const TicketSchema = z.looseObject({ claims: z.unknown() });
const AccessTokenSchema = z.looseObject({ sub: z.string(), sid: z.string() });
const AuthContextSchema = z.object({
  auth_time: z.optional(z.number()),
  amr: z.optional(z.array(z.string())),
});

type AuthContext = z.output<typeof AuthContextSchema>;

export function createSessionManager<
  RequiredScope extends ClientScope,
  Claims extends Record<string, unknown>,
>(
  server: AccountServer<RequiredScope, ClientScope>,
  clientId: string,
  requiredScopes: readonly RequiredScope[],
  claimsSchema: ClaimsSchema<Claims>,
  options: SessionModuleOptions<RequiredScope, Claims>,
): SessionManager<Claims> {
  const parsed = SessionOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new AccountError('invalid_request', {
      description: `session options: ${z.prettifyError(parsed.error)}`,
    });
  }

  const { store, resolve, onLogin = 'add' } = options;
  const accessTtl = options.accessTtl ?? DEFAULT_ACCESS_TTL;
  const refreshTtl = options.refreshTtl ?? DEFAULT_REFRESH_TTL;
  const accessKey = deriveKey(options.secret, 'access');
  const ticketKey = deriveKey(options.secret, 'ticket');

  const issue = async (
    subject: string,
    sessionId: string,
    claims: Claims,
    auth: AuthContext,
  ): Promise<IssuedTokens> => {
    const refreshToken = randomBytes(32).toString('base64url');
    await store.save({
      tokenHash: hash(refreshToken),
      sessionId,
      subject,
      claims: z.parse(JsonObjectSchema, JSON.parse(JSON.stringify({ ...claims, ...auth }))),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
      usedAt: null,
    });

    const accessToken = await new SignJWT({ ...claims, ...auth, sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subject)
      .setIssuer(clientId)
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime(`${accessTtl}s`)
      .sign(accessKey);

    return { accessToken, refreshToken, expiresIn: accessTtl, refreshExpiresIn: refreshTtl };
  };

  const idTokenClaimsOf = async (body: Credential): Promise<IdTokenClaims> => {
    if ('ticket' in body) {
      const ticket = await jwtDecrypt(body.ticket, ticketKey, { issuer: clientId }).catch(
        (cause: unknown) => {
          throw new AccountError('invalid_grant', {
            description: 'invalid or expired ticket',
            cause,
          });
        },
      );
      const { claims } = TicketSchema.parse(ticket.payload);
      return parseIdTokenClaims(claims);
    }

    const { tokens } = await server.loginWithCode({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
      nonce: body.nonce,
      iss: body.iss,
    });
    if (!tokens.idTokenClaims) throw new AccountError('invalid_id_token');

    return tokens.idTokenClaims;
  };

  return {
    async login(input) {
      const idTokenClaims = await idTokenClaimsOf(credentialOf(input));
      const user = userInfoFromIdToken(idTokenClaims, requiredScopes);
      const extra = isRecord(input)
        ? Object.fromEntries(Object.entries(input).filter(([key]) => !PROTOCOL_FIELDS.has(key)))
        : {};

      let resolved: ResolvedSession<Claims>;
      try {
        resolved = await resolve(user, { body: extra });
      } catch (error) {
        if (!isSessionRejected(error)) throw error;

        const ticket = await new EncryptJWT({ claims: idTokenClaims })
          .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
          .setIssuer(clientId)
          .setExpirationTime(TICKET_TTL)
          .encrypt(ticketKey);
        return { rejected: { ticket, details: error.details } };
      }

      const claims = z.parse(claimsSchema, resolved.claims ?? {});
      if (onLogin === 'replace') await store.deleteSubject(resolved.subject);

      const auth = { auth_time: idTokenClaims.auth_time, amr: idTokenClaims.amr };
      return { tokens: await issue(resolved.subject, randomUUID(), claims, auth) };
    },

    async refresh(refreshToken) {
      if (!refreshToken) return null;

      const tokenHash = hash(refreshToken);
      const record = await store.find(tokenHash);
      const now = new Date();
      if (!record || record.expiresAt <= now) return null;

      if (record.usedAt && now.getTime() - record.usedAt.getTime() > REUSE_GRACE_MS) {
        await store.deleteSession(record.sessionId);
        return null;
      }

      const claims = z.safeParse(claimsSchema, record.claims);
      const auth = AuthContextSchema.safeParse(record.claims);
      if (!claims.success || !auth.success) return null;

      await store.markUsed(tokenHash, now);
      await store.deleteUsed(record.sessionId, new Date(now.getTime() - REUSE_GRACE_MS));

      return issue(record.subject, record.sessionId, claims.data, auth.data);
    },

    async logout({ accessToken, refreshToken }) {
      const fromAccess = accessToken ? await verifyAccess(accessToken, true) : null;
      const fromRefresh = refreshToken ? await store.find(hash(refreshToken)) : null;
      const sessionId = fromAccess?.sid ?? fromRefresh?.sessionId;

      if (sessionId) await store.deleteSession(sessionId);
    },

    async verify(accessToken) {
      const verified = await verifyAccess(accessToken, false);
      if (!verified) return null;

      const claims = z.safeParse(claimsSchema, verified.payload);
      const auth = AuthContextSchema.safeParse(verified.payload);
      if (!claims.success || !auth.success) return null;
      if (store.isActive && !(await store.isActive(verified.sid))) return null;

      return { ...claims.data, ...auth.data, sub: verified.sub, sid: verified.sid };
    },
  };

  /** @param allowExpired 로그아웃은 만료된 access token으로도 할 수 있어야 해서, 그때는 만료 검사를 건너뛴다. */
  async function verifyAccess(
    token: string,
    allowExpired: boolean,
  ): Promise<{ sub: string; sid: string; payload: unknown } | null> {
    const result = await jwtVerify(token, accessKey, {
      algorithms: ['HS256'],
      issuer: clientId,
      audience: clientId,
      currentDate: allowExpired ? new Date(0) : undefined,
    }).catch(() => null);
    const payload = AccessTokenSchema.safeParse(result?.payload);

    return payload.success ? { ...payload.data, payload: result?.payload } : null;
  }
}

function credentialOf(input: unknown): Credential {
  const ticket = TicketBodySchema.safeParse(input);
  if (ticket.success) return ticket.data;

  const code = CodeBodySchema.safeParse(input);
  if (code.success) return code.data;

  throw new AccountError('invalid_request', { description: z.prettifyError(code.error) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function deriveKey(secret: string, purpose: 'access' | 'ticket'): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', secret, '', `gsainfoteam-account:${purpose}`, 32));
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** 패키지 사본이 둘 있어도 이 에러를 알아보도록 `instanceof` 대신 이름을 비교한다. */
function isSessionRejected(error: unknown): error is SessionRejected {
  return error instanceof Error && error.name === 'SessionRejected';
}
