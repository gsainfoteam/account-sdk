import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gsainfoteam_account/gsainfoteam_account.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/json.dart';

final discovery = File('../core/tests/fixtures/discovery.production.json').readAsStringSync();

http.Response json(Object? body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

class Servers {
  Servers({this.login, this.registration});

  final http.Response Function(Map<String, Object?> body)? login;
  final Object? registration;
  final logins = <Map<String, Object?>>[];
  var refreshes = 0;
  Duration refreshDelay = Duration.zero;

  late final client = MockClient((request) async {
    final path = request.url.path;
    if (path == '/.well-known/openid-configuration') {
      return http.Response(discovery, 200, headers: {'content-type': 'application/json'});
    }
    if (path == '/client/pot-g/public' && registration != null) return json(registration);
    if (request.url.host != 'api.pot-g.gistory.me') return http.Response('not found', 404);

    final body = jsonObject(request.body);
    if (path == '/auth/login') {
      logins.add(body);
      return login?.call(body) ?? json({'access_token': 'service-1', 'refresh_token': 'rt-1'});
    }
    if (path == '/auth/refresh') {
      refreshes++;
      await Future<void>.delayed(refreshDelay);
      return json({'access_token': 'service-${refreshes + 1}'});
    }
    return json(null, 204);
  });
}

typedef Callback = String Function(Uri authorize);

({AccountClient client, Servers servers, List<Uri> authorizations}) setup(
  Callback callback, {
  List<AccountScope>? scopes = const [AccountScope.name, AccountScope.email],
  Servers? servers,
}) {
  final fake = servers ?? Servers();
  final authorizations = <Uri>[];
  final client = AccountClient(
    issuer: AccountIssuer.production,
    clientId: 'pot-g',
    redirectUri: Uri.parse('pot-g-idp-login-redirect://callback'),
    api: Uri.parse('https://api.pot-g.gistory.me'),
    scopes: scopes,
    loginBody: () async => {'device_id': 'device-1'},
    store: MemoryTokenStore(),
    httpClient: fake.client,
    authenticate: (url, scheme) async {
      expect(scheme, 'pot-g-idp-login-redirect');
      authorizations.add(url);
      return callback(url);
    },
  );
  return (client: client, servers: fake, authorizations: authorizations);
}

String success(Uri authorize, {String? state, String iss = 'https://api.account.gistory.me'}) =>
    'pot-g-idp-login-redirect://callback?code=c-1&state=${state ?? authorize.queryParameters['state']}&iss=$iss';

void main() {
  setUp(clearDiscoveryCache);

  test('signs in through the browser and hands the code to the service backend', () async {
    final (:client, :servers, :authorizations) = setup(success);
    await client.login();

    final authorize = authorizations.single.queryParameters;
    expect(
      authorizations.single.origin + authorizations.single.path,
      'https://account.gistory.me/authorize',
    );
    expect(authorize['scope'], 'openid name email');
    expect(authorize['nonce'], isNotEmpty);
    expect(authorize['code_challenge_method'], 'S256');
    expect(authorize.containsKey('prompt'), isFalse);

    final login = servers.logins.single;
    expect(login, {
      'device_id': 'device-1',
      'code': 'c-1',
      'code_verifier': login['code_verifier'],
      'redirect_uri': 'pot-g-idp-login-redirect://callback',
      'nonce': authorize['nonce'],
      'iss': 'https://api.account.gistory.me',
      'transport': 'body',
    });
    final verifier = login['code_verifier']! as String;
    expect(
      authorize['code_challenge'],
      base64UrlEncode(sha256.convert(ascii.encode(verifier)).bytes).replaceAll('=', ''),
    );
    expect(client.state.status, AccountStatus.authenticated);
    expect(client.accessToken, 'service-1');
  });

  test('asks for the scopes registered for the client when none are given', () async {
    final (:client, servers: _, :authorizations) = setup(
      success,
      scopes: null,
      servers: Servers(
        registration: {
          'scopes': ['name'],
          'optionalScopes': ['email', 'new_one'],
        },
      ),
    );
    await client.login();
    expect(authorizations.single.queryParameters['scope'], 'openid name email');
  });

  test('asks for the login screen once after signing out', () async {
    final (:client, servers: _, :authorizations) = setup(success);
    await client.login();
    await client.logout();
    await client.login();
    expect(authorizations.last.queryParameters['prompt'], 'login');
  });

  test('rejects a callback with another state before reading its error', () async {
    final (:client, :servers, authorizations: _) = setup(
      (url) => 'pot-g-idp-login-redirect://callback?error=access_denied&state=forged',
    );
    await expectLater(client.login(), throwsA(isA<AccountStateMismatchException>()));
    expect(servers.logins, isEmpty);
  });

  test('rejects an iss that is not the IdP', () async {
    final (:client, servers: _, authorizations: _) = setup(
      (url) => success(url, iss: 'https://evil.example'),
    );
    await expectLater(client.login(), throwsA(isA<AccountIssuerMismatchException>()));
  });

  test('reports when the user backs out on the IdP page', () async {
    final (:client, servers: _, authorizations: _) = setup(
      (url) =>
          'pot-g-idp-login-redirect://callback?error=access_denied&error_description=user_cancelled&state=${url.queryParameters['state']}',
    );
    await expectLater(client.login(), throwsA(isA<AccountCancelledException>()));
  });

  test('reports when the user closes the browser', () async {
    final (:client, servers: _, authorizations: _) = setup(
      (_) => throw PlatformException(code: 'CANCELED'),
    );
    await expectLater(client.login(), throwsA(isA<AccountCancelledException>()));
  });

  test('retries a rejected login with the ticket and the extra body', () async {
    final servers = Servers(
      login: (body) => body['ticket'] == 't-1'
          ? json({'access_token': 'service-1', 'refresh_token': 'rt-1'})
          : json({
              'error': 'session_rejected',
              'ticket': 't-1',
              'details': {
                'requiredConsents': ['privacy'],
              },
            }, 403),
    );
    final (:client, servers: _, authorizations: _) = setup(success, servers: servers);

    await expectLater(
      client.login(),
      throwsA(
        isA<AccountSessionRejectedException>()
            .having((e) => e.statusCode, 'statusCode', 403)
            .having((e) => e.body, 'body', {
              'requiredConsents': ['privacy'],
            }),
      ),
    );
    expect(client.canRetryLogin, isTrue);

    await client.retryLogin({'agreed': true});
    expect(servers.logins.last, {'agreed': true, 'ticket': 't-1', 'transport': 'body'});
    expect(client.accessToken, 'service-1');
    expect(client.canRetryLogin, isFalse);
  });

  test('rejects a scope the IdP does not advertise before opening the browser', () async {
    final opened = <Uri>[];
    final body = jsonObject(discovery);
    final client = AccountClient(
      issuer: AccountIssuer.production,
      clientId: 'pot-g',
      redirectUri: Uri.parse('pot-g-idp-login-redirect://callback'),
      api: Uri.parse('https://api.pot-g.gistory.me'),
      scopes: const [AccountScope.name],
      store: MemoryTokenStore(),
      httpClient: MockClient(
        (request) async => json({
          ...body,
          'scope_supported': ['email'],
        }),
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
    final (:client, :servers, authorizations: _) = setup(success);
    await client.login();
    servers.refreshDelay = const Duration(milliseconds: 20);

    final results = await Future.wait(
      List.generate(3, (_) => client.refresh(staleToken: 'service-1')),
    );
    expect(results, [true, true, true]);
    expect(servers.refreshes, 1);
    expect(client.accessToken, 'service-2');
  });

  test('ends the IdP session in the browser when asked, returning to the redirect URI', () async {
    final opened = <Uri>[];
    final body = jsonObject(discovery);
    final client = AccountClient(
      issuer: AccountIssuer.production,
      clientId: 'pot-g',
      redirectUri: Uri.parse('pot-g-idp-login-redirect://callback'),
      api: Uri.parse('https://api.pot-g.gistory.me'),
      store: MemoryTokenStore(),
      httpClient: MockClient((request) async {
        if (request.url.path == '/.well-known/openid-configuration') {
          return json({
            ...body,
            'end_session_endpoint': 'https://account.account.gistory.me/logout',
          });
        }
        return json(null, 204);
      }),
      authenticate: (url, scheme) async {
        opened.add(url);
        return 'pot-g-idp-login-redirect://callback?state=${url.queryParameters['state']}';
      },
    );

    await client.logout(idp: true);

    final logout = opened.single;
    expect(logout.origin + logout.path, 'https://account.gistory.me/logout');
    expect(
      logout.queryParameters['post_logout_redirect_uri'],
      'pot-g-idp-login-redirect://callback',
    );
    expect(client.state.status, AccountStatus.unauthenticated);
  });
}
