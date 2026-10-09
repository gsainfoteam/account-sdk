/**
 * account-fe 가 사용자를 돌려보낼 때 알려 주는 사유.
 *
 * @remarks
 * account-fe 는 `error=access_denied` 로 redirect 하고 이 값을 `error_description` 에 담는다.
 * SDK 는 이 값을 에러 코드로 올려서, 앱이 경우마다 다르게 대응할 수 있게 한다.
 */
export const DENIAL_REASONS = [
  'user_cancelled',
  'verification_required',
  'consent_required',
  'login_required',
] as const;

export type DenialReason = (typeof DENIAL_REASONS)[number];
