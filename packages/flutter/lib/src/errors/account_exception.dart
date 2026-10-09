sealed class AccountException implements Exception {
  const AccountException();
}

final class AccountCancelledException extends AccountException {
  const AccountCancelledException();

  @override
  String toString() => 'AccountCancelledException';
}

enum AccountDenialReason { verificationRequired, consentRequired, loginRequired, other }

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
  const AccountOAuthException(this.error, [this.description]);

  final String error;
  final String? description;

  @override
  String toString() => 'AccountOAuthException($error, $description)';
}

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
