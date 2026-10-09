// account-fe 가 `error=access_denied` 와 함께 `error_description` 으로 돌려주는 거절 사유.
// 앱이 사유별로 다르게 안내해야 하므로 description 을 그대로 code 로 올린다.
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
  cause?: unknown;
}

export class AccountError extends Error {
  override readonly name = 'AccountError';
  readonly code: AccountErrorCode;
  readonly description: string | undefined;
  readonly status: number | undefined;

  constructor(code: AccountErrorCode, options: AccountErrorOptions = {}) {
    super(options.description ? `${code}: ${options.description}` : code, {
      cause: options.cause,
    });
    this.code = code;
    this.description = options.description;
    this.status = options.status;
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
