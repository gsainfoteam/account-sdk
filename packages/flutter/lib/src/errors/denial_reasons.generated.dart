/// account-fe 가 사용자를 돌려보낸 사유. `access_denied` 응답의 `error_description` 에서 읽는다.
///
/// `pnpm contract:dart` 가 `packages/contract` 에서 생성한다. 손으로 고치지 않는다.
enum AccountDenialReason {
  userCancelled('user_cancelled'),
  verificationRequired('verification_required'),
  consentRequired('consent_required'),
  loginRequired('login_required'),
  other('');

  const AccountDenialReason(this.wire);

  /// account-fe 가 `error_description` 에 담아 보내는 값.
  final String wire;

  static AccountDenialReason parse(String? wire) =>
      values.firstWhere((reason) => reason.wire == wire, orElse: () => other);
}
