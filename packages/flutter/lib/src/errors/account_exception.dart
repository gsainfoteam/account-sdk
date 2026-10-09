import 'denial_reasons.generated.dart';

export 'denial_reasons.generated.dart';

/// 이 패키지가 던지는 모든 에러. 하위 클래스로 switch 해서 경우마다 처리한다.
sealed class AccountException implements Exception {
  const AccountException();
}

/// 사용자가 브라우저를 닫았거나 IdP 페이지에서 취소했다.
final class AccountCancelledException extends AccountException {
  const AccountCancelledException();

  @override
  String toString() => 'AccountCancelledException';
}

/// IdP 가 돌려주는 OAuth 2.0 에러 코드.
enum OAuthErrorCode {
  accessDenied('access_denied'),
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

/// IdP 가 [reason] 때문에 로그인을 거절했다.
final class AccountDeniedException extends AccountException {
  const AccountDeniedException(this.reason, [this.description]);

  final AccountDenialReason reason;
  final String? description;

  @override
  String toString() => 'AccountDeniedException($reason, $description)';
}

/// callback 에 이 로그인을 시작할 때의 `state` 가 없었다.
final class AccountStateMismatchException extends AccountException {
  const AccountStateMismatchException();

  @override
  String toString() => 'AccountStateMismatchException';
}

/// callback 이 IdP 가 아닌 issuer 에서 왔다.
final class AccountIssuerMismatchException extends AccountException {
  const AccountIssuerMismatchException(this.issuer);

  final String issuer;

  @override
  String toString() => 'AccountIssuerMismatchException($issuer)';
}

/// IdP 가 `invalid_grant` 같은 OAuth 에러로 응답했다.
final class AccountOAuthException extends AccountException {
  AccountOAuthException(this.error, [this.description]) : code = OAuthErrorCode.parse(error);

  /// [error] 를 알려진 코드로 바꾼 것. 모르는 코드면 [OAuthErrorCode.unknown].
  final OAuthErrorCode code;

  /// IdP 가 보낸 그대로의 에러 코드.
  final String error;
  final String? description;

  @override
  String toString() => 'AccountOAuthException($error, $description)';
}

/// 서비스 백엔드가 요청을 거절했다. [body] 에 그 응답이 있다.
final class AccountSessionRejectedException extends AccountException {
  const AccountSessionRejectedException(this.statusCode, this.body);

  final int? statusCode;
  final Object? body;

  @override
  String toString() => 'AccountSessionRejectedException($statusCode)';
}

/// 요청이 서버에 닿지 못했다.
final class AccountNetworkException extends AccountException {
  const AccountNetworkException(this.cause);

  final Object cause;

  @override
  String toString() => 'AccountNetworkException($cause)';
}

/// discovery 문서를 받지 못했거나 해석하지 못했다.
final class AccountDiscoveryException extends AccountException {
  const AccountDiscoveryException(this.message);

  final String message;

  @override
  String toString() => 'AccountDiscoveryException($message)';
}
