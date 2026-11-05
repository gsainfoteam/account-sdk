import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { bearerToken, type HttpRequest } from './http';
import { Sessions } from './sessions';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: Sessions) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    const token = bearerToken(req);
    const sub = token && this.sessions.subjectOf(token);
    if (!sub) throw new UnauthorizedException();

    req.sub = sub;
    return true;
  }
}
