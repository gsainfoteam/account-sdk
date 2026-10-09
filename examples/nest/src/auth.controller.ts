import { AccountError, AccountService, type UserInfo } from '@gsainfoteam/account-nest';
import {
  BadGatewayException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { SessionService } from './session.service';

const REFRESH_COOKIE = 'refresh_token';

@Controller()
export class AuthController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const user = await this.account.getUserInfo(bearer(authorization)).catch((error: unknown) => {
      if (AccountError.is(error, 'invalid_token')) throw new UnauthorizedException();
      throw new BadGatewayException('IdP is unavailable');
    });
    return this.start(user, res);
  }

  @Post('auth/refresh')
  @HttpCode(200)
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): { access_token: string } {
    const rotated = this.sessions.rotate(req.cookies[REFRESH_COOKIE] ?? '');
    if (!rotated) throw new UnauthorizedException();
    res.cookie(REFRESH_COOKIE, rotated.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth',
    });
    return { access_token: rotated.accessToken };
  }

  @Post('auth/logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    this.sessions.revoke(req.cookies[REFRESH_COOKIE] ?? '');
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  @Get('me')
  me(@Headers('authorization') authorization: string | undefined): UserInfo {
    const user = this.sessions.userOf(bearer(authorization));
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private start(user: UserInfo, res: Response): { access_token: string } {
    const { accessToken, refreshToken } = this.sessions.issue(user);
    res.cookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, sameSite: 'lax', path: '/auth' });
    return { access_token: accessToken };
  }
}

function bearer(authorization: string | undefined): string {
  const [type, token] = authorization?.split(' ') ?? [];
  if (type !== 'Bearer' || !token) throw new UnauthorizedException();
  return token;
}
