const authorizationHeader = 'authorization';
const _scheme = 'Bearer ';

/// Formats an `Authorization` header value for [token].
String bearer(String token) => '$_scheme$token';

/// Reads the token out of an `Authorization` header value.
String? readBearer(Object? header) {
  if (header is! String || !header.startsWith(_scheme)) return null;
  final token = header.substring(_scheme.length);
  return token.isEmpty ? null : token;
}
