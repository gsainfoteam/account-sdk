import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final discovery = File('../core/tests/fixtures/discovery.production.json').readAsStringSync();

class FakeSession implements SessionAdapter {
  final starts = <String>[];
  var refreshes = 0;
  Duration refreshDelay = Duration.zero;

  @override
  Future<SessionTokens> start(String idpAccessToken) async {
    starts.add(idpAccessToken);
    return const SessionTokens(accessToken: 'service-1', refreshToken: 'rt-1');
  }

  @override
  Future<SessionTokens?> refresh(String refreshToken) async {
    refreshes++;
    await Future<void>.delayed(refreshDelay);
    return SessionTokens(accessToken: 'service-${refreshes + 1}');
  }

  @override
  Future<void> end({String? accessToken, String? refreshToken}) async {}
}

http.Client idp() => MockClient((request) async {
  if (request.url.path == '/.well-known/openid-configuration') {
    return http.Response(discovery, 200, headers: {'content-type': 'application/json'});
  }
  if (request.url.path == '/oauth/token') {
    return http.Response(
      jsonEncode({
        'access_token': 'idp-token',
        'token_type': 'Bearer',
        'expires_in': 10800,
        'scope': 'name email',
      }),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
  return http.Response('not found', 404);
});

typedef Callback = String Function(Uri authorize);

({AccountClient client, FakeSession session, List<Uri> authorizations}) setup(
  Callback callback, {
  List<AccountScope> scopes = const [AccountScope.name, AccountScope.email],
}) {
  final session = FakeSession();
  final authorizations = <Uri>[];
  final client = AccountClient(
    issuer: AccountIssuer.production,
    clientId: 'pot-g',
    redirectUri: Uri.parse('pot-g-idp-login-redirect://callback'),
    scopes: scopes,
    session: session,
    store: MemoryTokenStore(),
    httpClient: idp(),
    authenticate: (url, scheme) async {
      expect(scheme, 'pot-g-idp-login-redirect');
      authorizations.add(url);
      return callback(url);
    },
  );
  return (client: client, session: session, authorizations: authorizations);
}

String success(Uri authorize, {String? state, String iss = 'https://api.account.gistory.me'}) =>
    'pot-g-idp-login-redirect://callback?code=c-1&state=${state ?? authorize.queryParameters['state']}&iss=$iss';

void main() {
  setUp(clearDiscoveryCache);

  test('signs in through the browser and logs in to the service with the IdP token', () async {
    final (:client, :session, :authorizations) = setup(success);
    await client.login();

    final authorize = authorizations.single;
    expect(authorize.origin + authorize.path, 'https://account.gistory.me/authorize');
    expect(authorize.queryParameters['code_challenge_method'], 'S256');
    expect(authorize.queryParameters['scope'], 'name email');
    expect(authorize.queryParameters.containsKey('prompt'), isFalse);
    expect(session.starts, ['idp-token']);
    expect(client.state.status, AccountStatus.authenticated);
    expect(client.accessToken, 'service-1');
  });

  test('asks for the login screen once after signing out', () async {
    final (:client, session: _, :authorizations) = setup(success);
    await client.login();
    await client.logout();
    await client.login();
    expect(authorizations.last.queryParameters['prompt'], 'login');
  });

  test('rejects a callback with another state', () async {
    final (:client, :session, authorizations: _) = setup((url) => success(url, state: 'forged'));
    await expectLater(client.login(), throwsA(isA<AccountStateMismatchException>()));
    expect(session.starts, isEmpty);
  });

  test('rejects an iss that is not the IdP', () async {
    final (:client, session: _, authorizations: _) = setup(
      (url) => success(url, iss: 'https://evil.example'),
    );
    await expectLater(client.login(), throwsA(isA<AccountIssuerMismatchException>()));
  });

  test('reports when the user backs out on the IdP page', () async {
    final (:client, session: _, authorizations: _) = setup(
      (url) =>
          'pot-g-idp-login-redirect://callback?error=access_denied&error_description=user_cancelled&state=${url.queryParameters['state']}',
    );
    await expectLater(client.login(), throwsA(isA<AccountCancelledException>()));
  });

  test('reports when the user closes the browser', () async {
    final (:client, session: _, authorizations: _) = setup(
      (_) => throw PlatformException(code: 'CANCELED'),
    );
    await expectLater(client.login(), throwsA(isA<AccountCancelledException>()));
  });

  test('rejects a scope the IdP does not advertise before opening the browser', () async {
    final opened = <Uri>[];
    final body = jsonDecode(discovery) as Map<String, Object?>;
    final client = AccountClient(
      issuer: AccountIssuer.production,
      clientId: 'pot-g',
      redirectUri: Uri.parse('pot-g-idp-login-redirect://callback'),
      scopes: const [AccountScope.name],
      session: FakeSession(),
      store: MemoryTokenStore(),
      httpClient: MockClient(
        (request) async => http.Response(
          jsonEncode({
            ...body,
            'scope_supported': ['email'],
          }),
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
      authenticate: (url, scheme) async {
        opened.add(url);
        return success(url);
      },
    );
    await expectLater(
      client.login(),
      throwsA(
        isA<AccountOAuthException>().having((e) => e.code, 'code', OAuthErrorCode.invalidScope),
      ),
    );
    expect(opened, isEmpty);
  });

  test('refreshes once for concurrent 401s', () async {
    final (:client, :session, authorizations: _) = setup(success);
    await client.login();
    session.refreshDelay = const Duration(milliseconds: 20);

    final results = await Future.wait(
      List.generate(3, (_) => client.refresh(staleToken: 'service-1')),
    );
    expect(results, [true, true, true]);
    expect(session.refreshes, 1);
    expect(client.accessToken, 'service-2');
  });
}
