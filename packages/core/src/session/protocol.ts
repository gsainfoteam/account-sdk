// 서비스 프론트(web, flutter)와 account-nest 세션 endpoint가 서로 맞춰야 하는 wire 형식이다.

import * as z from 'zod/mini';

import { type SdkErrorCode } from '../errors/account-error';

export type SessionTransport = 'cookie' | 'body';

export const LoginTicketBodySchema = z.object({ ticket: z.string() });
export const LoginCodeBodySchema = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  nonce: z.string(),
  iss: z.optional(z.string()),
});

export type LoginRequestBody = (
  z.input<typeof LoginTicketBodySchema> | z.input<typeof LoginCodeBodySchema>
) & { transport?: SessionTransport };

/** 서비스가 login body에 같이 보낸 값 중 이 키는 `resolve`에 넘기지 않는다. */
export const LOGIN_PROTOCOL_FIELDS: readonly string[] = [
  ...Object.keys(LoginTicketBodySchema.shape),
  ...Object.keys(LoginCodeBodySchema.shape),
  'transport',
];

export const SessionTokensResponseSchema = z.looseObject({
  access_token: z.string().check(z.minLength(1)),
  expires_in: z.optional(z.number()),
  /** `transport: 'body'`일 때만 있다. */
  refresh_token: z.optional(z.string()),
});
export type SessionTokensResponse = z.input<typeof SessionTokensResponseSchema>;

export const SESSION_REJECTED = 'session_rejected' satisfies SdkErrorCode;

/** 403 응답이다. client는 `ticket`과 추가 입력으로 다시 login 한다. */
export interface SessionRejectedResponse {
  error: typeof SESSION_REJECTED;
  ticket: string;
  details: unknown;
}
