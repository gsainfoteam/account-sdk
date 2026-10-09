const authorizationHeader = 'authorization';
const _scheme = 'Bearer ';

/// [token] 으로 `Authorization` 헤더 값을 만든다.
String bearer(String token) => '$_scheme$token';

/// `Authorization` 헤더 값에서 토큰을 꺼낸다.
String? readBearer(Object? header) {
  if (header is! String || !header.startsWith(_scheme)) return null;
  final token = header.substring(_scheme.length);
  return token.isEmpty ? null : token;
}
