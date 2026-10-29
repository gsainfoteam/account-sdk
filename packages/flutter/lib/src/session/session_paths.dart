/// 기본값은 ziggle-be 와 house-moving-out-be 를 따르고, `packages/core/src/constants/idp.json` 의
/// `sessionPaths` 와 같다.
final class SessionPaths {
  const SessionPaths({
    this.login = '/auth/login',
    this.refresh = '/auth/refresh',
    this.logout = '/auth/logout',
  });

  final String login;
  final String refresh;
  final String logout;
}
