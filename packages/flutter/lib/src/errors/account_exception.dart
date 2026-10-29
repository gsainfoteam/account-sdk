import 'denial_reasons.generated.dart';

export 'denial_reasons.generated.dart';

sealed class AccountException implements Exception {
  const AccountException();
}

final class AccountCancelledException extends AccountException {
  const AccountCancelledException();

  @override
  String toString() => 'AccountCancelledException';
}

enum OAuthErrorCode {
  accessDenied('access_denied'),
  loginRequired('login_required'),
  consentRequired('consent_required'),
  interactionRequired('interaction_required'),
  invalidRequest('invalid_request'),
  invalidScope('invalid_scope'),
  unauthorizedClient('unauthorized_client'),
  unsupportedResponseType('unsupported_response_type'),
  serverError('server_error'),
  temporarilyUnavailable('temporarily_unavailable'),
  invalidGrant('invalid_grant'),
  invalidClient('invalid_client'),
  unsupportedGrantType('unsupported_grant_type'),
  unknown('');

  const OAuthErrorCode(this.wire);

  final String wire;

  static OAuthErrorCode parse(String wire) =>
      values.firstWhere((code) => code.wire == wire, orElse: () => unknown);
}

final class AccountDeniedException extends AccountException {
  const AccountDeniedException(this.reason, [this.description]);

  final AccountDenialReason reason;
  final String? description;

  @override
  String toString() => 'AccountDeniedException($reason, $description)';
}

final class AccountStateMismatchException extends AccountException {
  const AccountStateMismatchException();

  @override
  String toString() => 'AccountStateMismatchException';
}

final class AccountIssuerMismatchException extends AccountException {
  const AccountIssuerMismatchException(this.issuer);

  final String issuer;

  @override
  String toString() => 'AccountIssuerMismatchException($issuer)';
}

final class AccountOAuthException extends AccountException {
  AccountOAuthException(this.error, [this.description]) : code = OAuthErrorCode.parse(error);

  final OAuthErrorCode code;

  final String error;
  final String? description;

  @override
  String toString() => 'AccountOAuthException($error, $description)';
}

/// 로그인이 거절됐다면 [AccountClient.retryLogin] 으로 추가 입력(약관 동의 같은 것)을 보내 이어 갈 수 있다.
final class AccountSessionRejectedException extends AccountException {
  const AccountSessionRejectedException(this.statusCode, this.body);

  final int? statusCode;
  final Object? body;

  @override
  String toString() => 'AccountSessionRejectedException($statusCode)';
}

final class AccountNetworkException extends AccountException {
  const AccountNetworkException(this.cause);

  final Object cause;

  @override
  String toString() => 'AccountNetworkException($cause)';
}

final class AccountDiscoveryException extends AccountException {
  const AccountDiscoveryException(this.message);

  final String message;

  @override
  String toString() => 'AccountDiscoveryException($message)';
}
