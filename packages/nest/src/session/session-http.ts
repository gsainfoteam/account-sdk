import { AccountError, readBearer } from '@gsainfoteam/account-core';
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  InternalServerErrorException,
  Post,
  Res,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { parseCookie, stringifySetCookie, type SerializeOptions } from 'cookie';

import {
  type IssuedTokens,
  type SessionManager,
  type SessionModuleOptions,
} from './session-manager';

const SESSION = Symbol('gsainfoteam-account:session');

interface SessionRequest {
  headers: Record<string, string | string[] | undefined>;
  [SESSION]?: unknown;
}

/** Express 의 `Response` 와 Fastify 의 `FastifyReply` 가 함께 가진 메서드. */
interface HeaderTarget {
  header(name: string, value: string): unknown;
}

/** 세션 endpoint 의 경로. */
export interface SessionPaths {
  login: string;
  refresh: string;
  logout: string;
}

/** 모듈이 만든 세션 관리자와 refresh token 쿠키 설정. */
export interface SessionRuntime {
  manager: SessionManager<Record<string, unknown>>;
  cookie: { name: string; attributes: SerializeOptions };
}

/**
 * {@link SessionGuard} 나 {@link OptionalSessionGuard} 가 확인한 세션을 핸들러 인자로 받는다.
 * 타입은 `SessionOf<typeof account>` 로 붙인다.
 */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<SessionRequest>()[SESSION],
);

/**
 * refresh token 쿠키의 속성. `Path` 는 refresh endpoint 의 디렉터리라서, 쿠키가 다른 API 요청에는 실리지 않는다.
 * 지울 때도 같은 속성이어야 브라우저가 같은 쿠키로 본다.
 */
export function cookieSettings(
  cookie: SessionModuleOptions<never, Record<never, never>>['cookie'] = {},
  paths: SessionPaths,
): SessionRuntime['cookie'] {
  return {
    name: cookie.name ?? 'refresh_token',
    attributes: {
      httpOnly: true,
      secure: cookie.secure ?? true,
      sameSite: cookie.sameSite ?? 'strict',
      domain: cookie.domain,
      path: paths.refresh.slice(0, paths.refresh.lastIndexOf('/')) || '/',
    },
  };
}

/** 로그인, refresh, 로그아웃 endpoint 를 가진 controller 를 만든다. */
export function createSessionController(runtimeToken: symbol, paths: SessionPaths): Type<unknown> {
  @Controller()
  class SessionController {
    constructor(@Inject(runtimeToken) private readonly runtime: SessionRuntime) {}

    @Post(paths.login)
    @HttpCode(200)
    async login(@Body() body: unknown, @Res({ passthrough: true }) res: HeaderTarget) {
      const result = await this.runtime.manager.login(body).catch(toHttpError);
      if ('rejected' in result) {
        throw new ForbiddenException({ error: 'session_rejected', ...result.rejected });
      }

      return this.respond(result.tokens, isBodyTransport(body), res);
    }

    @Post(paths.refresh)
    @HttpCode(200)
    async refresh(
      @Body() body: unknown,
      @Headers('cookie') cookie: string | undefined,
      @Res({ passthrough: true }) res: HeaderTarget,
    ) {
      const fromBody = refreshTokenIn(body);
      const tokens = await this.runtime.manager.refresh(fromBody ?? this.cookieValue(cookie));

      if (!tokens) {
        if (fromBody === undefined) this.clearCookie(res);
        throw new UnauthorizedException();
      }

      return this.respond(tokens, fromBody !== undefined, res);
    }

    @Post(paths.logout)
    @HttpCode(204)
    async logout(
      @Body() body: unknown,
      @Headers('authorization') authorization: string | undefined,
      @Headers('cookie') cookie: string | undefined,
      @Res({ passthrough: true }) res: HeaderTarget,
    ): Promise<void> {
      await this.runtime.manager.logout({
        accessToken: readBearer(authorization) ?? undefined,
        refreshToken: refreshTokenIn(body) ?? this.cookieValue(cookie),
      });
      this.clearCookie(res);
    }

    private respond(tokens: IssuedTokens, inBody: boolean, res: HeaderTarget) {
      const response = { access_token: tokens.accessToken, expires_in: tokens.expiresIn };
      if (inBody) return { ...response, refresh_token: tokens.refreshToken };

      const { name, attributes } = this.runtime.cookie;
      res.header(
        'set-cookie',
        stringifySetCookie(name, tokens.refreshToken, {
          ...attributes,
          maxAge: tokens.refreshExpiresIn,
        }),
      );
      return response;
    }

    private cookieValue(header: string | undefined): string | undefined {
      return parseCookie(header ?? '')[this.runtime.cookie.name];
    }

    private clearCookie(res: HeaderTarget): void {
      const { name, attributes } = this.runtime.cookie;
      res.header('set-cookie', stringifySetCookie(name, '', { ...attributes, maxAge: 0 }));
    }
  }

  return SessionController;
}

/** 세션이 없으면 401 을 던지는 guard 와, 세션이 없어도 지나가게 하는 guard 를 만든다. */
export function createSessionGuards(
  accountToken: abstract new () => {
    verifySession(accessToken: string): Promise<unknown>;
  },
): { SessionGuard: Type<CanActivate>; OptionalSessionGuard: Type<CanActivate> } {
  const sessionOf = async (
    account: InstanceType<typeof accountToken>,
    request: SessionRequest,
  ): Promise<unknown> => {
    const header = request.headers.authorization;
    const token = readBearer(typeof header === 'string' ? header : undefined);

    return token ? account.verifySession(token) : null;
  };

  @Injectable()
  class SessionGuard implements CanActivate {
    constructor(
      @Inject(accountToken) private readonly account: InstanceType<typeof accountToken>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<SessionRequest>();
      const session = await sessionOf(this.account, request);
      if (!session) throw new UnauthorizedException();

      request[SESSION] = session;
      return true;
    }
  }

  @Injectable()
  class OptionalSessionGuard implements CanActivate {
    constructor(
      @Inject(accountToken) private readonly account: InstanceType<typeof accountToken>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<SessionRequest>();
      request[SESSION] = (await sessionOf(this.account, request)) ?? undefined;
      return true;
    }
  }

  return { SessionGuard, OptionalSessionGuard };
}

function isBodyTransport(body: unknown): boolean {
  return isRecord(body) && body.transport === 'body';
}

function refreshTokenIn(body: unknown): string | undefined {
  return isRecord(body) && typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 세션 관리자가 던진 {@link AccountError} 를 HTTP 에러로 바꾼다. 서비스가 `resolve` 에서 던진 에러는 그대로 둔다. */
function toHttpError(error: unknown): never {
  if (!AccountError.is(error)) throw error;

  const body = { error: error.code, error_description: error.description };
  switch (error.code) {
    case 'invalid_request':
      throw new BadRequestException(body);
    case 'network_error':
    case 'server_error':
    case 'discovery_failed':
    case 'temporarily_unavailable':
      throw new BadGatewayException(body);
    case 'invalid_client':
    case 'unauthorized_client':
    case 'invalid_scope':
    case 'missing_claims':
      throw new InternalServerErrorException(body);
    default:
      throw new UnauthorizedException(body);
  }
}
