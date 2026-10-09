import { isError } from 'es-toolkit';
import * as z from 'zod/mini';

/**
 * Reasons account-fe gives for turning a user away.
 *
 * account-fe redirects back with `error=access_denied` and puts the reason in `error_description`.
 * The SDK lifts that reason into {@link AccountError.code} so an app can react to each case.
 */
export const DenialReasonSchema = z.enum([
  'user_cancelled',
  'verification_required',
  'consent_required',
  'login_required',
]);

/** Error codes defined by OAuth 2.0 (RFC 6749) that the IdP returns. */
export const OAuthErrorCodeSchema = z.enum([
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

/** Errors the SDK raises itself while validating responses or talking to a service backend. */
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
  'unknown',
]);

/** Every code an {@link AccountError} can carry. */
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
   * Checks the shape instead of using `instanceof`, because a bundler that duplicates this module
   * would make `instanceof` fail for errors thrown by the other copy.
   */
  static is(value: unknown, code?: AccountErrorCode): value is AccountError {
    if (!isError(value)) return false;

    const shape = AccountErrorShapeSchema.safeParse(value);
    return shape.success && (code === undefined || shape.data.code === code);
  }
}

/**
 * Turns an OAuth error response into an {@link AccountError}.
 *
 * `access_denied` with a {@link DenialReason} as its description becomes that reason.
 * Unknown codes become `unknown` and keep the original code in `description`.
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
