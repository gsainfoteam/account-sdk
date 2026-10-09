/// Paths of a service backend's session endpoints. Override only what differs.
///
/// The defaults follow ziggle-be and house-moving-out-be, and mirror `sessionPaths` in
/// `packages/core/src/constants/idp.json`.
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
