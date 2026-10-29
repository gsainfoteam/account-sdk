import { CurrentSession } from '@gsainfoteam/account-nest';
import { Controller, Get, UseGuards } from '@nestjs/common';

import { SessionGuard, type Session } from './account';

@Controller()
export class MeController {
  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentSession() session: Session): Session {
    return session;
  }
}
