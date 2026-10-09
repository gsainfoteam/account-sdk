/// OpenID Connect scopes the client branches on.
///
/// The package keeps no list of the IdP's other scopes. [AccountClient.login] checks the requested
/// scopes against the ones discovery advertises, so a scope the IdP adds works without a new release.
abstract final class OidcScopes {
  /// Adds an id_token. This package does not verify id_tokens, so it does not ask for one.
  static const openid = 'openid';

  /// Adds a refresh token, and with it `prompt=consent`.
  static const offlineAccess = 'offline_access';
}
