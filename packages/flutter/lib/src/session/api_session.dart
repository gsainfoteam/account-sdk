import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants.dart';
import '../errors/account_exception.dart';
import '../http/bearer.dart';
import 'session_paths.dart';
import 'session_tokens.dart';

final class SessionRejection implements Exception {
  const SessionRejection(this.exception, this.ticket);

  final AccountSessionRejectedException exception;
  final String ticket;
}

/// 앱에는 쿠키가 없으므로 `transport: 'body'`를 써서 refresh token을 body로 주고받는다.
class ApiSession {
  ApiSession(this._http, this.api, this.paths);

  final http.Client _http;
  final Uri api;
  final SessionPaths paths;

  Future<SessionTokens> start(Map<String, Object?> body) async {
    final (status, json) = await _post(paths.login, body);
    if (_ok(status)) return SessionTokens.fromJson(json);

    if (json case {'ticket': final String ticket}) {
      throw SessionRejection(AccountSessionRejectedException(status, json['details']), ticket);
    }
    throw AccountSessionRejectedException(status, json);
  }

  Future<SessionTokens?> refresh(String refreshToken) async {
    final (status, json) = await _post(paths.refresh, {'refresh_token': refreshToken});
    if (AccountConstants.authFailureStatuses.contains(status)) return null;
    if (!_ok(status)) throw AccountSessionRejectedException(status, json);

    return SessionTokens.fromJson(json);
  }

  Future<void> end({String? accessToken, String? refreshToken}) =>
      _post(paths.logout, {'refresh_token': refreshToken ?? ''}, accessToken: accessToken);

  Future<(int, Object?)> _post(
    String path,
    Map<String, Object?> body, {
    String? accessToken,
  }) async {
    final url = api.replace(path: '${api.path.replaceFirst(RegExp(r'/$'), '')}$path');

    final http.Response response;
    try {
      response = await _http.post(
        url,
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          if (accessToken != null) authorizationHeader: bearer(accessToken),
        },
        body: jsonEncode({...body, 'transport': 'body'}),
      );
    } on Exception catch (cause) {
      throw AccountNetworkException(cause);
    }

    try {
      return (response.statusCode, jsonDecode(response.body));
    } on FormatException {
      return (response.statusCode, null);
    }
  }
}

bool _ok(int status) => status >= 200 && status < 300;
