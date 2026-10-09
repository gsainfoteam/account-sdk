import '../constants.dart';
import '../errors/account_exception.dart';

/// IdP endpoints, normalized from its discovery document.
class AccountMetadata {
  const AccountMetadata({
    required this.issuer,
    required this.issuers,
    required this.authorizationEndpoint,
    required this.tokenEndpoint,
    required this.userinfoEndpoint,
    required this.scopesSupported,
  });

  final String issuer;

  /// Issuer values accepted in a callback `iss` parameter.
  final List<String> issuers;
  final Uri authorizationEndpoint;
  final Uri tokenEndpoint;
  final Uri userinfoEndpoint;
  final List<String> scopesSupported;
}

/// Builds [AccountMetadata] from a discovery document and the URL it was fetched from.
///
/// Follows the same rules as `normalizeDiscovery` in the TypeScript core: account-be derives its endpoints
/// from `BASE_URL`, which points to a host that does not exist on staging, so endpoints are rebuilt on the
/// host the document came from. Callback and id_token issuers come from a separate setting, so every host
/// the IdP owns is accepted.
///
/// Throws [AccountDiscoveryException] when the document lacks an endpoint.
AccountMetadata normalizeDiscovery(Object? json, Uri fetchedFrom) {
  if (json case {
    'issuer': final String issuer,
    'authorization_endpoint': final String authorizationEndpoint,
    'token_endpoint': final String tokenEndpoint,
  } when issuer.isNotEmpty && authorizationEndpoint.isNotEmpty && tokenEndpoint.isNotEmpty) {
    final apiOrigin = fetchedFrom.replace(path: '', query: null);
    final frontOrigin = apiOrigin.replace(
      host: apiOrigin.host.replaceFirst(
        RegExp('^${RegExp.escape(AccountConstants.apiHostPrefix)}'),
        '',
      ),
    );
    Uri onApi(String endpoint) => apiOrigin.replace(path: Uri.parse(endpoint).path);

    return AccountMetadata(
      issuer: issuer,
      issuers: {issuer, _origin(frontOrigin), _origin(apiOrigin)}.toList(),
      authorizationEndpoint: frontOrigin.replace(path: Uri.parse(authorizationEndpoint).path),
      tokenEndpoint: onApi(tokenEndpoint),
      userinfoEndpoint: onApi(switch (json['userinfo_endpoint']) {
        final String endpoint => endpoint,
        _ => AccountConstants.fallbackUserinfoPath,
      }),
      scopesSupported: switch (json['scopes_supported'] ?? json['scope_supported']) {
        final List<Object?> scopes => scopes.whereType<String>().toList(),
        _ => const [],
      },
    );
  }
  throw const AccountDiscoveryException('missing issuer or endpoints');
}

String _origin(Uri uri) => '${uri.scheme}://${uri.authority}';
