import 'session_tokens.dart';

/// Starts, refreshes and ends a service backend's session.
///
/// Use [BodySession], or implement this for a backend whose requests or responses look different.
abstract interface class SessionAdapter {
  Future<SessionTokens> start(String idpAccessToken);

  /// Returns `null` when the refresh token is no longer valid.
  Future<SessionTokens?> refresh(String refreshToken);

  Future<void> end({String? accessToken, String? refreshToken});
}
