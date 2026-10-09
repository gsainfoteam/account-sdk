/// Every error this package throws. Switch over the subclasses to handle each case.
sealed class AccountException implements Exception {
  const AccountException();
}

/// The user closed the browser or cancelled on the IdP page.
final class AccountCancelledException extends AccountException {
  const AccountCancelledException();

  @override
  String toString() => 'AccountCancelledException';
}

/// Why account-fe turned the user away, from `error_description` of an `access_denied` response.
enum AccountDenialReason { verificationRequired, consentRequired, loginRequired, other }

/// The IdP refused the sign-in for [reason].
final class AccountDeniedException extends AccountException {
  const AccountDeniedException(this.reason, [this.description]);

  final AccountDenialReason reason;
  final String? description;

  @override
  String toString() => 'AccountDeniedException($reason, $description)';
}

/// The callback did not carry the `state` this sign-in started with.
final class AccountStateMismatchException extends AccountException {
  const AccountStateMismatchException();

  @override
  String toString() => 'AccountStateMismatchException';
}

/// The callback came from an issuer that is not the IdP.
final class AccountIssuerMismatchException extends AccountException {
  const AccountIssuerMismatchException(this.issuer);

  final String issuer;

  @override
  String toString() => 'AccountIssuerMismatchException($issuer)';
}

/// The IdP answered with an OAuth error such as `invalid_grant`.
final class AccountOAuthException extends AccountException {
  const AccountOAuthException(this.error, [this.description]);

  final String error;
  final String? description;

  @override
  String toString() => 'AccountOAuthException($error, $description)';
}

/// The service backend refused the request. [body] holds its response.
final class AccountSessionRejectedException extends AccountException {
  const AccountSessionRejectedException(this.statusCode, this.body);

  final int? statusCode;
  final Object? body;

  @override
  String toString() => 'AccountSessionRejectedException($statusCode)';
}

/// The request did not reach the server.
final class AccountNetworkException extends AccountException {
  const AccountNetworkException(this.cause);

  final Object cause;

  @override
  String toString() => 'AccountNetworkException($cause)';
}

/// The discovery document could not be fetched or understood.
final class AccountDiscoveryException extends AccountException {
  const AccountDiscoveryException(this.message);

  final String message;

  @override
  String toString() => 'AccountDiscoveryException($message)';
}
