import 'denial_reasons.generated.dart';
import 'oauth_error_codes.generated.dart';

export 'denial_reasons.generated.dart';
export 'oauth_error_codes.generated.dart';

sealed class AccountException implements Exception {
  const AccountException();
}

final class AccountCancelledException extends AccountException {
  const AccountCancelledException();

  @override
  String toString() => 'AccountCancelledException';
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

/// IdP가 \`code\`도 \`error\`도 없이 돌려보냈다.
final class AccountMissingCodeException extends AccountException {
  const AccountMissingCodeException();

  @override
  String toString() => 'AccountMissingCodeException';
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

/// 로그인이 거절됐다면 [AccountClient.retryLogin]으로 추가 입력(약관 동의 같은 것)을 보내 로그인을 이어 갈 수 있다.
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
