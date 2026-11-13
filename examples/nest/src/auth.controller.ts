import { toHttpException } from '@infoteam/account-nest';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import { AccountService } from './account';
import { bearerToken, readCookie, type HttpRequest, type HttpResponse } from './http';
import { Sessions } from './sessions';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
} as const;

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

// A browser always sends Origin on POST, so this blocks forms from other origins; apps send none.
function assertTrustedOrigin(req: HttpRequest): void {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== WEB_ORIGIN)
    throw new BadRequestException('untrusted origin');
}

const LoginBody = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  nonce: z.string(),
  iss: z.string().optional(),
  transport: z.enum(['cookie', 'body']).default('cookie'),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: Sessions,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: HttpRequest,
    @Body() raw: unknown,
    @Res({ passthrough: true }) res: HttpResponse,
  ) {
    assertTrustedOrigin(req);
    const body = LoginBody.safeParse(raw);
    if (!body.success) throw new BadRequestException(body.error.issues);

    const { code, code_verifier, redirect_uri, nonce, iss, transport } = body.data;
    const { user } = await this.account
      .loginWithCode({ code, codeVerifier: code_verifier, redirectUri: redirect_uri, nonce, iss })
      .catch(toHttpException);

    return this.respond(this.sessions.issue(user.sub), transport, res);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Req() req: HttpRequest,
    @Body() body: { refresh_token?: string } | undefined,
    @Res({ passthrough: true }) res: HttpResponse,
  ) {
    assertTrustedOrigin(req);
    const fromBody = body?.refresh_token;
    const tokens = this.sessions.rotate(fromBody ?? readCookie(req, REFRESH_COOKIE) ?? '');
    if (!tokens) throw new UnauthorizedException();

    return this.respond(tokens, fromBody ? 'body' : 'cookie', res);
  }

  @Post('logout')
  @HttpCode(204)
  logout(
    @Req() req: HttpRequest,
    @Body() body: { refresh_token?: string } | undefined,
    @Res({ passthrough: true }) res: HttpResponse,
  ): void {
    assertTrustedOrigin(req);
    this.sessions.end(body?.refresh_token ?? readCookie(req, REFRESH_COOKIE), bearerToken(req));
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }

  private respond(
    { accessToken, refreshToken, expiresIn }: ReturnType<Sessions['issue']>,
    transport: 'cookie' | 'body',
    res: HttpResponse,
  ) {
    if (transport === 'body') {
      return { access_token: accessToken, expires_in: expiresIn, refresh_token: refreshToken };
    }
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { access_token: accessToken, expires_in: expiresIn };
  }
}
