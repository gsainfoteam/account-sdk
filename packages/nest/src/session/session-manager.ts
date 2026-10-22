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

/** 서비스 세션의 claim 을 정의하는 zod 스키마. 결과는 객체여야 한다. */
export type ClaimsSchema<Claims extends Record<string, unknown>> = z.core.$ZodType<Claims>;

/** {@link SessionModuleOptions.resolve} 가 돌려주는 값. 세션의 주인과, access token 에 실을 claim 이다. */
export type ResolvedSession<Claims extends Record<string, unknown>> = {
  subject: string;
} & (keyof Claims extends never ? { claims?: Claims } : { claims: Claims });

/** 검증한 서비스 access token. `sub` 는 `resolve` 가 정한 subject, `sid` 는 로그인 한 번의 id 다. */
export type Session<Claims extends Record<string, unknown> = Record<never, never>> = {
  sub: string;
  sid: string;
} & Claims;

/**
 * `forRoot` 의 `session` 옵션. 런타임 값과 DI 로 받는 것이다.
 *
 * @typeParam RequiredScope `defineAccount` 의 `requiredScopes`. `resolve` 가 받는 사용자의 필수 필드다.
 */
export interface SessionModuleOptions<
  RequiredScope extends ClientScope,
  Claims extends Record<string, unknown>,
> {
  /** access token 서명과 ticket 암호화 키를 여기서 유도한다. 32자 이상. */
  secret: string;
  store: SessionStore;
  /**
   * IdP 사용자를 서비스 사용자로 바꾼다. 보통 DB 에 upsert 하고 그 id 를 `subject` 로 돌려준다.
   * `body` 는 로그인 요청에서 프로토콜 필드를 뺀 나머지다. pot-g 의 `device_id` 같은 것이 온다.
   *
   * 로그인 전에 더 받을 것이 있으면(약관 동의 같은 것) {@link SessionRejected} 를 던진다.
   */
  resolve(
    user: UserInfo<RequiredScope>,
    context: { body: Record<string, unknown> },
  ): ResolvedSession<Claims> | Promise<ResolvedSession<Claims>>;
  /** access token 수명(초). 기본 15분. */
  accessTtl?: number;
  /** refresh token 수명(초). 교체할 때마다 다시 센다. 기본 30일. */
  refreshTtl?: number;
  /** `replace` 면 로그인할 때 같은 subject 의 다른 세션을 모두 끝낸다. 기본은 `add`. */
  onLogin?: 'add' | 'replace';
  /** refresh token 쿠키의 속성. 기본은 `refresh_token`, `HttpOnly`, `Secure`, `SameSite=Strict`. */
  cookie?: {
    name?: string;
    sameSite?: 'strict' | 'lax' | 'none';
    secure?: boolean;
    domain?: string;
  };
}

/**
 * `resolve` 에서 던져 로그인을 거절한다. 클라이언트는 403 과 함께 `details` 와 ticket 을 받고,
 * `retryLogin(body)` 로 추가 입력을 보내면 같은 사용자로 `resolve` 가 다시 불린다.
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
  /** access token 수명(초). */
  expiresIn: number;
  /** refresh token 수명(초). 쿠키의 `Max-Age` 다. */
  refreshExpiresIn: number;
}

export type LoginResult =
  { tokens: IssuedTokens } | { rejected: { ticket: string; details: unknown } };

export interface SessionManager<Claims extends Record<string, unknown>> {
  login(body: unknown): Promise<LoginResult>;
  /** @returns 세션이 없거나 끝났으면 `null`. */
  refresh(refreshToken: string | undefined): Promise<IssuedTokens | null>;
  logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void>;
  /** @returns 토큰이 유효하지 않거나 세션이 끝났으면 `null`. */
  verify(accessToken: string): Promise<Session<Claims> | null>;
}

const DEFAULT_ACCESS_TTL = 15 * 60;
const DEFAULT_REFRESH_TTL = 30 * 24 * 60 * 60;
const TICKET_TTL = '5m';
/**
 * 쓰인 refresh token 을 이 시간 안에 다시 받으면 새 토큰을 준다. 탭 두 개가 같은 쿠키로 동시에 refresh 하는 일이
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
  ): Promise<IssuedTokens> => {
    const refreshToken = randomBytes(32).toString('base64url');
    await store.save({
      tokenHash: hash(refreshToken),
      sessionId,
      subject,
      claims: z.parse(JsonObjectSchema, claims),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
      usedAt: null,
    });

    const accessToken = await new SignJWT({ ...claims, sid: sessionId })
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

      return { tokens: await issue(resolved.subject, randomUUID(), claims) };
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
      if (!claims.success) return null;

      await store.markUsed(tokenHash, now);
      await store.deleteUsed(record.sessionId, new Date(now.getTime() - REUSE_GRACE_MS));

      return issue(record.subject, record.sessionId, claims.data);
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
      if (!claims.success) return null;
      if (store.isActive && !(await store.isActive(verified.sid))) return null;

      return { ...claims.data, sub: verified.sub, sid: verified.sid };
    },
  };

  /** @param allowExpired 로그아웃은 만료된 access token 으로도 할 수 있어야 해서, 그때는 만료 검사를 비켜 간다. */
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

/** 패키지 사본이 둘이어도 알아보도록 `instanceof` 대신 이름을 본다. */
function isSessionRejected(error: unknown): error is SessionRejected {
  return error instanceof Error && error.name === 'SessionRejected';
}
