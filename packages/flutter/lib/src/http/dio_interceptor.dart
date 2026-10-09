import 'package:dio/dio.dart';

import '../client/account_client.dart';

abstract final class SkipAccountAuth {
  static const key = 'gsainfoteam_account.skip';
  static const extra = {key: true};
}

const _retriedKey = 'gsainfoteam_account.retried';

class AccountInterceptor extends QueuedInterceptor {
  AccountInterceptor(this.client, this.dio);

  final AccountClient client;
  final Dio dio;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra[SkipAccountAuth.key] == true) {
      return handler.next(options);
    }
    await client.mutex.acquireRead();
    final token = client.accessToken;
    client.mutex.release();
    if (token != null) options.headers['authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final sent = (options.headers['authorization'] as String?)?.replaceFirst('Bearer ', '');
    if (err.response?.statusCode != 401 ||
        options.extra[SkipAccountAuth.key] == true ||
        options.extra[_retriedKey] == true ||
        sent == null) {
      return handler.next(err);
    }
    if (!await client.refresh(staleToken: sent)) return handler.next(err);
    options.extra[_retriedKey] = true;
    options.headers['authorization'] = 'Bearer ${client.accessToken}';
    try {
      handler.resolve(await dio.fetch<Object?>(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
