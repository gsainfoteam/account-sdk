import '../errors/account_exception.dart';

class AccountMetadata {
  const AccountMetadata({
    required this.issuer,
    required this.authorizationEndpoint,
    required this.tokenEndpoint,
    required this.userinfoEndpoint,
    required this.scopesSupported,
    this.endSessionEndpoint,
  });

  final String issuer;
  final Uri authorizationEndpoint;
  final Uri tokenEndpoint;
  final Uri userinfoEndpoint;
  final List<String> scopesSupported;

  final Uri? endSessionEndpoint;
}

AccountMetadata normalizeDiscovery(Object? json) {
  if (json
      case {
        'issuer': final String issuer,
        'authorization_endpoint': final String authorizationEndpoint,
        'token_endpoint': final String tokenEndpoint,
        'userinfo_endpoint': final String userinfoEndpoint,
      }
      when issuer.isNotEmpty &&
          _isHttpUrl(authorizationEndpoint) &&
          _isHttpUrl(tokenEndpoint) &&
          _isHttpUrl(userinfoEndpoint)) {
    return AccountMetadata(
      issuer: issuer,
      authorizationEndpoint: Uri.parse(authorizationEndpoint),
      tokenEndpoint: Uri.parse(tokenEndpoint),
      userinfoEndpoint: Uri.parse(userinfoEndpoint),
      scopesSupported: switch (json['scopes_supported']) {
        final List<Object?> scopes => scopes.whereType<String>().toList(),
        _ => const [],
      },
      endSessionEndpoint: switch (json['end_session_endpoint']) {
        final String endpoint when _isHttpUrl(endpoint) => Uri.parse(endpoint),
        _ => null,
      },
    );
  }
  throw const AccountDiscoveryException('missing issuer or endpoints');
}

bool _isHttpUrl(String value) => switch (Uri.tryParse(value)) {
  final Uri uri => uri.hasAuthority && (uri.isScheme('http') || uri.isScheme('https')),
  null => false,
};
