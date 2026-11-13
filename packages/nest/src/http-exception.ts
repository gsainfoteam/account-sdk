import { AccountError } from '@infoteam/account-server';
import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * `loginWithCode`의 `AccountError`를 HTTP 예외로 바꿔 던진다. `AccountError`가 아니면 그대로 던진다.
 *
 * 403은 세션 프로토콜의 거절 전용이라 쓰지 않는다. 프론트 SDK가 403을 약관 동의 같은 추가 입력 요청으로 처리한다.
 */
export function toHttpException(error: unknown): never {
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
