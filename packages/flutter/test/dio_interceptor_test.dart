import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class ServiceAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final ok = options.headers['authorization'] == 'Bearer token-2';
    return ResponseBody.fromString(
      jsonEncode(ok ? {'ok': true} : {'message': 'Unauthorized'}),
      ok ? 200 : 401,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('retries once with the refreshed token and refreshes once for concurrent 401s', () async {
    var refreshes = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.pot-g.gistory.me'))
      ..httpClientAdapter = ServiceAdapter();
    final store = MemoryTokenStore();
    await store.write(const StoredSession(accessToken: 'token-1', refreshToken: 'rt-1'));
    final client = AccountClient(
      issuer: AccountIssuer.production,
      clientId: 'pot-g',
      redirectUri: Uri.parse('pot-g://callback'),
      api: Uri.parse('https://api.pot-g.gistory.me'),
      store: store,
      httpClient: MockClient((request) async {
        refreshes++;
        return http.Response(jsonEncode({'access_token': 'token-2'}), 200);
      }),
    );
    await client.restore();
    dio.interceptors.add(AccountInterceptor(client, dio));

    final responses = await Future.wait(List.generate(3, (_) => dio.get<Object?>('/me')));
    expect(responses.map((response) => response.statusCode), [200, 200, 200]);
    expect(refreshes, 1);
  });
}
