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
  if (json is! Map<String, Object?>) {
    throw const AccountDiscoveryException('not a JSON object');
  }
  String field(String key) {
    final value = json[key];
    if (value is! String || value.isEmpty) {
      throw AccountDiscoveryException('missing $key');
    }
    return value;
  }

  final apiOrigin = fetchedFrom.replace(path: '', query: null);
  final frontOrigin = apiOrigin.replace(
    host: apiOrigin.host.replaceFirst(
      RegExp('^${RegExp.escape(AccountConstants.apiHostPrefix)}'),
      '',
    ),
  );
  Uri onApi(String endpoint) => apiOrigin.replace(path: Uri.parse(endpoint).path);
  final scopes = json['scopes_supported'] ?? json['scope_supported'];

  return AccountMetadata(
    issuer: field('issuer'),
    issuers: {field('issuer'), _origin(frontOrigin), _origin(apiOrigin)}.toList(),
    authorizationEndpoint: frontOrigin.replace(
      path: Uri.parse(field('authorization_endpoint')).path,
    ),
    tokenEndpoint: onApi(field('token_endpoint')),
    userinfoEndpoint: onApi(
      (json['userinfo_endpoint'] as String?) ?? AccountConstants.fallbackEndpoints['userinfo']!,
    ),
    scopesSupported: scopes is List ? scopes.whereType<String>().toList() : const [],
  );
}

String _origin(Uri uri) => '${uri.scheme}://${uri.authority}';
