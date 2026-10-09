/**
 * Reasons account-fe gives for turning a user away.
 *
 * account-fe redirects back with `error=access_denied` and puts the reason in `error_description`.
 * The SDK lifts that reason into {@link AccountError.code} so an app can react to each case.
 */
export const DENIAL_REASONS = [
  'user_cancelled',
  'verification_required',
  'consent_required',
  'login_required',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];

/** Error codes defined by OAuth 2.0 (RFC 6749) that the IdP returns. */
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

/** Errors the SDK raises itself while validating responses or talking to a service backend. */
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

/** Every code an {@link AccountError} can carry. */
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
  /** Human-readable detail, such as the IdP's `error_description`. */
  description?: string;
  /** HTTP status of the response that caused the error, if any. */
  status?: number;
  /**
   * Body a service backend sent when it rejected a login.
   *
   * For example house-moving-out-be answers `403` with `requiredConsents`, which the app needs to show the consent form.
   */
  details?: unknown;
  cause?: unknown;
}

/**
 * The single error type every package in the SDK throws.
 *
 * Branch on {@link AccountError.code} rather than on the message.
 *
 * @example
 * ```ts
 * try {
 *   await client.handleCallback();
 * } catch (error) {
 *   if (AccountError.is(error, 'user_cancelled')) return navigate('/');
 *   throw error;
 * }
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
   * Tells whether `value` is an {@link AccountError}, optionally with a given code.
   *
   * @remarks
   * Checks `name` and `code` instead of `instanceof`, because a bundler that duplicates this module
   * would make `instanceof` fail for errors thrown by the other copy.
   */
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

/**
 * Turns an OAuth error response into an {@link AccountError}.
 *
 * `access_denied` with one of {@link DENIAL_REASONS} as its description becomes that reason.
 * Unknown codes become `unknown` and keep the original code in `description`.
 */
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
