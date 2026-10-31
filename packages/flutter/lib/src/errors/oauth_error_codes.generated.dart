/// 이 파일은 `pnpm contract:dart`가 `packages/contract`에서 생성한다. 손으로 고치지 않는다.
enum OAuthErrorCode {
  invalidRequest('invalid_request'),
  unauthorizedClient('unauthorized_client'),
  accessDenied('access_denied'),
  unsupportedResponseType('unsupported_response_type'),
  invalidScope('invalid_scope'),
  serverError('server_error'),
  temporarilyUnavailable('temporarily_unavailable'),
  loginRequired('login_required'),
  consentRequired('consent_required'),
  interactionRequired('interaction_required'),
  invalidClient('invalid_client'),
  invalidGrant('invalid_grant'),
  unsupportedGrantType('unsupported_grant_type'),
  unknown('');

  const OAuthErrorCode(this.wire);

  final String wire;

  static OAuthErrorCode parse(String wire) =>
      values.firstWhere((code) => code.wire == wire, orElse: () => unknown);
}
