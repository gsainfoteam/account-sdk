/** account-fe는 `error=access_denied`로 redirect 하고 이 값을 `error_description`에 담는다. */
export const DENIAL_REASONS = [
  'user_cancelled',
  'verification_required',
  'consent_required',
  'login_required',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];
