import { DENIAL_REASONS, OAUTH_ERROR_CODES } from '@infoteam/account-contract';
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
  'invalid_ticket',
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

/** 실패 화면을 고를 때 쓴다. 코드가 늘어도 앱의 분기가 그대로 맞도록 SDK가 코드를 묶는다. */
export type AccountErrorKind =
  'cancelled' | 'verification' | 'rejected' | 'expired' | 'network' | 'unknown';

const KIND_CODES = {
  cancelled: ['user_cancelled', 'access_denied'],
  verification: ['verification_required'],
  rejected: ['session_rejected'],
  expired: ['invalid_ticket'],
  network: ['network_error', 'discovery_failed', 'temporarily_unavailable', 'server_error'],
} as const satisfies Record<Exclude<AccountErrorKind, 'unknown'>, readonly AccountErrorCode[]>;

type CodeOf<K extends keyof typeof KIND_CODES> = (typeof KIND_CODES)[K][number];

const KINDS = new Map<AccountErrorCode, AccountErrorKind>(
  Object.entries(KIND_CODES).flatMap(([kind, codes]) =>
    codes.map((code) => [code, kind as AccountErrorKind] as const),
  ),
);

const AccountErrorShapeSchema = z.object({
  name: z.literal('AccountError'),
  code: AccountErrorCodeSchema,
});

export interface AccountErrorOptions {
  description?: string;
  status?: number;
  /** `session_rejected`에만 남는다. */
  reason?: string;
  /** `session_rejected`에만 남는다. */
  details?: unknown;
  cause?: unknown;
}

class AccountErrorBase extends Error {
  /** 하위 클래스의 `instanceof`가 확인할 kind다. 비어 있으면 모든 AccountError를 받는다. */
  protected static readonly variant: AccountErrorKind | undefined = undefined;

  override readonly name = 'AccountError';
  readonly code: AccountErrorCode;
  readonly kind: AccountErrorKind;
  readonly description: string | undefined;
  readonly status: number | undefined;

  constructor(code: AccountErrorCode, options: AccountErrorOptions = {}) {
    super(options.description ? `${code}: ${options.description}` : code, {
      cause: options.cause,
    });
    this.code = code;
    this.kind = KINDS.get(code) ?? 'unknown';
    this.description = options.description;
    this.status = options.status;

    // 공개 생성자는 이것 하나다. 코드에 맞는 하위 클래스를 돌려줘야 모든 AccountError가 여섯 종류 중 하나로 닫힌다.
    if (new.target === AccountErrorBase) return new VARIANTS[this.kind](code, options);
  }

  /** 번들러가 이 모듈을 중복으로 넣으면 prototype이 달라지므로, 모양으로 확인한다. */
  static is(value: unknown, code?: AccountErrorCode): value is AccountError {
    if (!isError(value)) return false;

    const shape = AccountErrorShapeSchema.safeParse(value);
    return shape.success && (code === undefined || shape.data.code === code);
  }

  /** `instanceof`도 {@link is}처럼 모양으로 확인해서, 다른 사본이 던진 에러도 알아본다. */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (!AccountErrorBase.is(value)) return false;

    return this.variant === undefined || value.kind === this.variant;
  }
}

class CancelledError extends AccountErrorBase {
  protected static override readonly variant = 'cancelled';
  declare readonly kind: 'cancelled';
  declare readonly code: CodeOf<'cancelled'>;
}

class VerificationError extends AccountErrorBase {
  protected static override readonly variant = 'verification';
  declare readonly kind: 'verification';
  declare readonly code: CodeOf<'verification'>;
}

class RejectedError extends AccountErrorBase {
  protected static override readonly variant = 'rejected';
  declare readonly kind: 'rejected';
  declare readonly code: CodeOf<'rejected'>;
  /** 프론트가 어떤 입력 화면을 보여 줄지 고르는 값이다. 예: 약관 동의가 필요하면 `terms_required`. */
  readonly reason: string | undefined;
  /** 거절 응답의 `details`다. house-moving-out-be의 `403`은 `requiredConsents`를 담는다. */
  readonly details: unknown;

  constructor(code: AccountErrorCode, options: AccountErrorOptions = {}) {
    super(code, options);
    this.reason = options.reason;
    this.details = options.details;
  }
}

class ExpiredError extends AccountErrorBase {
  protected static override readonly variant = 'expired';
  declare readonly kind: 'expired';
  declare readonly code: CodeOf<'expired'>;
}

class NetworkError extends AccountErrorBase {
  protected static override readonly variant = 'network';
  declare readonly kind: 'network';
  declare readonly code: CodeOf<'network'>;
}

class UnknownError extends AccountErrorBase {
  protected static override readonly variant = 'unknown';
  declare readonly kind: 'unknown';
  declare readonly code: Exclude<AccountErrorCode, CodeOf<keyof typeof KIND_CODES>>;
}

const VARIANTS: Record<
  AccountErrorKind,
  new (code: AccountErrorCode, options: AccountErrorOptions) => AccountErrorBase
> = {
  cancelled: CancelledError,
  verification: VerificationError,
  rejected: RejectedError,
  expired: ExpiredError,
  network: NetworkError,
  unknown: UnknownError,
};

/**
 * Dart의 sealed class처럼 여섯 종류로 닫혀 있다. `switch (error.kind)`에서 빠진 경우를 컴파일러가 잡고,
 * `error instanceof AccountError.Rejected`로 좁히면 그 종류에만 있는 필드를 읽을 수 있다.
 */
export type AccountError =
  CancelledError | VerificationError | RejectedError | ExpiredError | NetworkError | UnknownError;

// eslint-disable-next-line @typescript-eslint/no-namespace -- AccountError.Rejected 같은 타입 이름은 값과 같은 이름 아래에 둘 방법이 namespace뿐이다
export declare namespace AccountError {
  export type Cancelled = CancelledError;
  export type Verification = VerificationError;
  export type Rejected = RejectedError;
  export type Expired = ExpiredError;
  export type Network = NetworkError;
  export type Unknown = UnknownError;
}

/** 하위 클래스는 `instanceof`로만 쓴다. 직접 만들면 코드와 종류가 어긋날 수 있어서 생성자를 감춘다. */
interface AccountErrorVariant<T> {
  readonly prototype: T;
  [Symbol.hasInstance](value: unknown): value is T;
}

interface AccountErrorConstructor {
  new (code: AccountErrorCode, options?: AccountErrorOptions): AccountError;
  readonly prototype: AccountError;
  is(value: unknown, code?: AccountErrorCode): value is AccountError;
  [Symbol.hasInstance](value: unknown): value is AccountError;

  readonly Cancelled: AccountErrorVariant<CancelledError>;
  readonly Verification: AccountErrorVariant<VerificationError>;
  readonly Rejected: AccountErrorVariant<RejectedError>;
  readonly Expired: AccountErrorVariant<ExpiredError>;
  readonly Network: AccountErrorVariant<NetworkError>;
  readonly Unknown: AccountErrorVariant<UnknownError>;
}

// 클래스 선언은 생성자가 자기 인스턴스 타입을 돌려준다고 보므로, union을 돌려주는 생성자 타입으로 바꿔 내보낸다.
export const AccountError = Object.assign(AccountErrorBase, {
  Cancelled: CancelledError,
  Verification: VerificationError,
  Rejected: RejectedError,
  Expired: ExpiredError,
  Network: NetworkError,
  Unknown: UnknownError,
}) as unknown as AccountErrorConstructor;

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
