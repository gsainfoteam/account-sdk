import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { type HttpRequest } from './http';
import { SessionGuard } from './session.guard';

@Controller()
export class MeController {
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: HttpRequest): { sub: string } {
    return { sub: req.sub! };
  }
}
