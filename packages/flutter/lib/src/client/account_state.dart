/// [AccountClient.restore] 가 돌기 전까지는 `loading` 이다.
enum AccountStatus { loading, authenticated, unauthenticated }

/// [AccountClient] 의 상태 스냅샷.
class AccountState {
  const AccountState(this.status, [this.accessToken]);

  final AccountStatus status;

  /// 서비스 백엔드의 access token.
  final String? accessToken;
}
