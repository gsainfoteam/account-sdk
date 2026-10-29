/// [AccountClient.restore]가 실행되기 전까지는 `loading`이다.
enum AccountStatus { loading, authenticated, unauthenticated }

class AccountState {
  const AccountState(this.status, [this.accessToken]);

  final AccountStatus status;

  /// 서비스 백엔드의 access token이다.
  final String? accessToken;
}
