import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../errors/account_exception.dart';
import 'account_issuer.dart';
import 'account_metadata.dart';

final _cache = <String, Future<AccountMetadata>>{};

Future<AccountMetadata> discover(AccountIssuer issuer, {http.Client? client}) {
  final url = issuer.discoveryUrl;
  return _cache.putIfAbsent(url.toString(), () {
    final pending = _fetch(url, client ?? http.Client());
    // 실패를 캐시하면 일시적인 네트워크 오류가 앱을 다시 켤 때까지 남는다.
    unawaited(pending.then<void>((_) {}, onError: (Object _) => _cache.remove(url.toString())));
    return pending;
  });
}

void clearDiscoveryCache() => _cache.clear();

Future<AccountMetadata> _fetch(Uri url, http.Client client) async {
  final http.Response response;
  try {
    response = await client.get(url, headers: {'accept': 'application/json'});
  } on Exception catch (cause) {
    throw AccountNetworkException(cause);
  }
  if (response.statusCode != 200) {
    throw AccountDiscoveryException('GET $url -> ${response.statusCode}');
  }
  final Object? json;
  try {
    json = jsonDecode(response.body);
  } on FormatException {
    throw AccountDiscoveryException('$url is not JSON');
  }
  return normalizeDiscovery(json, url);
}
