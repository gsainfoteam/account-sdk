/// `loading` until [AccountClient.restore] has run.
enum AccountStatus { loading, authenticated, unauthenticated }

/// Snapshot of an [AccountClient].
class AccountState {
  const AccountState(this.status, [this.accessToken]);

  final AccountStatus status;

  /// The service backend's access token.
  final String? accessToken;
}
