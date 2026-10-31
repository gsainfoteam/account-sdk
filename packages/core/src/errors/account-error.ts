import { DENIAL_REASONS, OAUTH_ERROR_CODES } from '@gsainfoteam/account-contract';
import { isError } from 'es-toolkit';
import * as z from 'zod/mini';

export const DenialReasonSchema = z.enum(DENIAL_REASONS);

export const OAuthErrorCodeSchema = z.enum(OAUTH_ERROR_CODES);

export const SdkErrorCodeSchema = z.enum([
  'state_mismatch',
  'issuer_mismatch',
  'missing_code',
  'invalid_id_token',
  'invalid_token',
  'discovery_failed',
  'network_error',
  'unauthenticated',
  'session_rejected',
  'missing_claims',
  'insufficient_authentication',
  'unknown',
]);

export const AccountErrorCodeSchema = z.union([
  DenialReasonSchema,
  OAuthErrorCodeSchema,
  SdkErrorCodeSchema,
]);

export type DenialReason = z.infer<typeof DenialReasonSchema>;
export type OAuthErrorCode = z.infer<typeof OAuthErrorCodeSchema>;
export type SdkErrorCode = z.infer<typeof SdkErrorCodeSchema>;
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;

const AccountErrorShapeSchema = z.object({
  name: z.literal('AccountError'),
  code: AccountErrorCodeSchema,
});

export interface AccountErrorOptions {
  description?: string;
  status?: number;
  /** 서비스 백엔드가 로그인을 거절하며 보낸 body다. house-moving-out-be의 `403`은 `requiredConsents`를 담는다. */
  details?: unknown;
  cause?: unknown;
}

/** 메시지가 아니라 {@link AccountError.code}로 분기한다. */
export class AccountError extends Error {
  override readonly name = 'AccountError';
  readonly code: AccountErrorCode;
  readonly description: string | undefined;
  readonly status: number | undefined;
  readonly details: unknown;

  constructor(code: AccountErrorCode, options: AccountErrorOptions = {}) {
    super(options.description ? `${code}: ${options.description}` : code, {
      cause: options.cause,
    });
    this.code = code;
    this.description = options.description;
    this.status = options.status;
    this.details = options.details;
  }

  /** `instanceof` 대신 모양을 확인한다. 번들러가 이 모듈을 중복으로 넣으면 다른 사본이 던진 에러에는 `instanceof`가 실패한다. */
  static is(value: unknown, code?: AccountErrorCode): value is AccountError {
    if (!isError(value)) return false;

    const shape = AccountErrorShapeSchema.safeParse(value);
    return shape.success && (code === undefined || shape.data.code === code);
  }
}

export function fromOAuthError(
  error: string,
  description?: string | null,
  status?: number,
): AccountError {
  const denial = DenialReasonSchema.safeParse(description);
  if (error === 'access_denied' && denial.success) {
    return new AccountError(denial.data, { status });
  }

  const known = OAuthErrorCodeSchema.safeParse(error);
  return known.success
    ? new AccountError(known.data, { description: description ?? undefined, status })
    : new AccountError('unknown', {
        description: description ? `${error}: ${description}` : error,
        status,
      });
}
