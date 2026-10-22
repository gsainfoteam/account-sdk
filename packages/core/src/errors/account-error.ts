import { DENIAL_REASONS } from '@gsainfoteam/account-contract';
import { isError } from 'es-toolkit';
import * as z from 'zod/mini';

/** account-fe 가 사용자를 돌려보낼 때 알려 주는 사유. 목록은 `@gsainfoteam/account-contract` 에서 온다. */
export const DenialReasonSchema = z.enum(DENIAL_REASONS);

/**
 * IdP 가 돌려주는 OAuth 2.0(RFC 6749) 에러 코드와, `prompt=none` 에 대한 OIDC Core 3.1.2.6절의 코드.
 *
 * @remarks
 * 예전 account-fe 는 `login_required` 와 `consent_required` 를 `access_denied` 의 `error_description` 으로 보냈다.
 * 그 경우는 {@link fromOAuthError} 가 같은 코드로 바꾼다.
 */
export const OAuthErrorCodeSchema = z.enum([
  'access_denied',
  'login_required',
  'consent_required',
  'interaction_required',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
  'unsupported_response_type',
  'server_error',
  'temporarily_unavailable',
  'invalid_grant',
  'invalid_client',
  'unsupported_grant_type',
]);

/** 응답을 검증하거나 서비스 백엔드와 통신하다가 SDK 가 직접 내는 에러. */
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
  'unknown',
]);

/** {@link AccountError} 가 가질 수 있는 모든 코드. */
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
  /** 사람이 읽을 상세 설명. IdP 의 `error_description` 같은 것이다. */
  description?: string;
  /** 에러를 일으킨 응답의 HTTP status. 응답이 없었으면 비어 있다. */
  status?: number;
  /**
   * 서비스 백엔드가 로그인을 거절하며 보낸 body.
   *
   * 예를 들어 house-moving-out-be 는 `403` 과 함께 `requiredConsents` 를 보내고, 앱은 이걸로 동의 화면을 띄운다.
   */
  details?: unknown;
  cause?: unknown;
}

/**
 * SDK 의 모든 패키지가 던지는 단 하나의 에러 타입.
 *
 * 메시지가 아니라 {@link AccountError.code} 로 분기한다.
 *
 * @example
 * ```ts
 * const { error } = account.store.getState();
 * if (AccountError.is(error, 'user_cancelled')) return navigate('/');
 * ```
 */
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

  /**
   * `value` 가 {@link AccountError} 인지 알려 준다. `code` 를 주면 그 코드인지도 확인한다.
   *
   * @remarks
   * `instanceof` 대신 모양을 확인한다. 번들러가 이 모듈을 중복으로 넣으면, 다른 사본이 던진 에러에는
   * `instanceof` 가 실패하기 때문이다.
   */
  static is(value: unknown, code?: AccountErrorCode): value is AccountError {
    if (!isError(value)) return false;

    const shape = AccountErrorShapeSchema.safeParse(value);
    return shape.success && (code === undefined || shape.data.code === code);
  }
}

/**
 * OAuth 에러 응답을 {@link AccountError} 로 바꾼다.
 *
 * description 이 {@link DenialReason} 인 `access_denied` 는 그 사유가 코드가 된다.
 * 모르는 코드는 `unknown` 이 되고, 원래 코드는 `description` 에 남긴다.
 */
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
