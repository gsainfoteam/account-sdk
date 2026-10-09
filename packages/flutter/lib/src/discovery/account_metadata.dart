import '../constants.dart';
import '../errors/account_exception.dart';

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
  final List<String> issuers;
  final Uri authorizationEndpoint;
  final Uri tokenEndpoint;
  final Uri userinfoEndpoint;
  final List<String> scopesSupported;
}

// web 의 normalizeDiscovery 와 같은 규칙이다. account-be 가 BASE_URL 로 issuer 와 endpoint 를 만들어
// 스테이징 문서가 존재하지 않는 호스트를 가리키므로, 문서를 받아 온 호스트를 기준으로 다시 만든다.
// id_token 과 callback 의 iss 는 다른 env 에서 오므로 IdP 의 두 호스트를 모두 받아들인다.
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
