enum AccountStatus { loading, authenticated, unauthenticated }

class AccountState {
  const AccountState(this.status, [this.accessToken]);

  final AccountStatus status;
  final String? accessToken;
}
