import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

import type { SessionTransport } from '@infoteam/account-server';

const TRANSPORTS = ['cookie', 'body'] satisfies SessionTransport[];

/** ticket 흐름이 없는 서비스의 `POST /auth/login` body다. 서비스 입력이 더 있으면 상속해서 필드를 더한다. */
export class LoginCodeBody {
  @ApiProperty({ type: String })
  @IsString()
  code!: string;

  @ApiProperty({ type: String })
  @IsString()
  code_verifier!: string;

  @ApiProperty({ type: String })
  @IsString()
  redirect_uri!: string;

  @ApiProperty({ type: String })
  @IsString()
  nonce!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  iss?: string;

  @ApiPropertyOptional({ enum: TRANSPORTS, description: '앱은 body, 웹은 cookie' })
  @IsOptional()
  @IsIn(TRANSPORTS)
  transport?: SessionTransport;
}

const withoutTicket = (body: LoginBody) => body.ticket === undefined;

/**
 * 403 거절 뒤 ticket으로 다시 로그인하는 서비스의 body다. code 필드는 ticket이 없을 때만 검사한다.
 * 동의 여부 같은 추가 입력은 상속해서 더한다.
 */
export class LoginBody {
  @ApiPropertyOptional({ type: String, description: 'ticket이 없으면 필수' })
  @ValidateIf(withoutTicket)
  @IsString()
  code!: string;

  @ApiPropertyOptional({ type: String, description: 'ticket이 없으면 필수' })
  @ValidateIf(withoutTicket)
  @IsString()
  code_verifier!: string;

  @ApiPropertyOptional({ type: String, description: 'ticket이 없으면 필수' })
  @ValidateIf(withoutTicket)
  @IsString()
  redirect_uri!: string;

  @ApiPropertyOptional({ type: String, description: 'ticket이 없으면 필수' })
  @ValidateIf(withoutTicket)
  @IsString()
  nonce!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  iss?: string;

  @ApiPropertyOptional({ type: String, description: '403 session_rejected 응답의 ticket' })
  @IsOptional()
  @IsString()
  ticket?: string;

  @ApiPropertyOptional({ enum: TRANSPORTS, description: '앱은 body, 웹은 cookie' })
  @IsOptional()
  @IsIn(TRANSPORTS)
  transport?: SessionTransport;
}
