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
    this.endSessionEndpoint,
  });

  final String issuer;

  final List<String> issuers;
  final Uri authorizationEndpoint;
  final Uri tokenEndpoint;
  final Uri userinfoEndpoint;
  final List<String> scopesSupported;

  final Uri? endSessionEndpoint;
}

/// TypeScript core의 `normalizeDiscovery`와 같은 규칙을 따른다. account-be는 endpoint를 `BASE_URL`로
/// 만드는데 스테이징에서는 이 값이 존재하지 않는 호스트를 가리킨다. 그래서 문서를 받아 온 호스트를
/// 기준으로 endpoint를 다시 만든다. callback과 id_token의 issuer는 별도 설정에서 오므로 IdP가 가진 호스트를 모두
/// 받아들인다.
AccountMetadata normalizeDiscovery(Object? json, Uri fetchedFrom) {
  if (json case {
    'issuer': final String issuer,
    'authorization_endpoint': final String authorizationEndpoint,
    'token_endpoint': final String tokenEndpoint,
    'userinfo_endpoint': final String userinfoEndpoint,
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
      userinfoEndpoint: onApi(userinfoEndpoint),
      scopesSupported: switch (json['scopes_supported']) {
        final List<Object?> scopes => scopes.whereType<String>().toList(),
        _ => const [],
      },
      endSessionEndpoint: switch (json['end_session_endpoint']) {
        final String endpoint => frontOrigin.replace(path: Uri.parse(endpoint).path),
        _ => null,
      },
    );
  }
  throw const AccountDiscoveryException('missing issuer or endpoints');
}

String _origin(Uri uri) => '${uri.scheme}://${uri.authority}';
