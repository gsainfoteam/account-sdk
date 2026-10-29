const authorizationHeader = 'authorization';
const _scheme = 'Bearer ';

String bearer(String token) => '$_scheme$token';

String? readBearer(Object? header) {
  if (header is! String || !header.startsWith(_scheme)) return null;
  final token = header.substring(_scheme.length);
  return token.isEmpty ? null : token;
}
