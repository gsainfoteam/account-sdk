// account-fe 는 거절 사유를 `access_denied` 의 error_description 에 싣는다. 앱이 사유별로 안내하도록 code 로 올린다.
export const DENIAL_REASONS = [
  'user_cancelled',
  'verification_required',
  'consent_required',
  'login_required',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

export type OAuthErrorCode =
  | 'access_denied'
  | 'invalid_request'
  | 'invalid_scope'
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_grant'
  | 'invalid_client'
  | 'unsupported_grant_type';

export type SdkErrorCode =
  | 'state_mismatch'
  | 'issuer_mismatch'
  | 'missing_code'
  | 'invalid_id_token'
  | 'invalid_token'
  | 'discovery_failed'
  | 'network_error'
  | 'unauthenticated'
  | 'session_rejected'
  | 'unknown';

export type AccountErrorCode = DenialReason | OAuthErrorCode | SdkErrorCode;

const OAUTH_ERROR_CODES: ReadonlySet<string> = new Set<OAuthErrorCode>([
  'access_denied',
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

export interface AccountErrorOptions {
  description?: string;
  status?: number;
  // 서비스 백엔드가 거절하며 돌려준 body. house-be 의 requiredConsents 처럼 앱이 읽어야 하는 값이 들어 있다.
  details?: unknown;
  cause?: unknown;
}

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

  // 번들러가 클래스를 복제하면 instanceof 가 틀리므로 name 과 code 로 판별한다.
  static is(value: unknown, code?: AccountErrorCode): value is AccountError {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'AccountError' &&
      typeof (value as { code?: unknown }).code === 'string' &&
      (code === undefined || (value as { code: unknown }).code === code)
    );
  }
}

export function fromOAuthError(
  error: string,
  description?: string | null,
  status?: number,
): AccountError {
  if (error === 'access_denied' && description && isDenialReason(description)) {
    return new AccountError(description, { status });
  }
  const code: AccountErrorCode = OAUTH_ERROR_CODES.has(error)
    ? (error as OAuthErrorCode)
    : 'unknown';
  return new AccountError(code, {
    description: description ?? (code === 'unknown' ? error : undefined),
    status,
  });
}

function isDenialReason(value: string): value is DenialReason {
  return (DENIAL_REASONS as readonly string[]).includes(value);
}
