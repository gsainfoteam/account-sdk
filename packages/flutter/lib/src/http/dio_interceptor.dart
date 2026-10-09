import 'package:dio/dio.dart';

import '../client/account_client.dart';
import '../constants.dart';
import 'bearer.dart';

abstract final class SkipAccountAuth {
  static const key = '${AccountConstants.storageNamespace}:skip';
  static const extra = {key: true};
}

const _retriedKey = '${AccountConstants.storageNamespace}:retried';

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
    if (token != null) options.headers[authorizationHeader] = bearer(token);
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final sent = readBearer(options.headers[authorizationHeader]);
    if (err.response?.statusCode != AccountConstants.unauthorizedStatus ||
        options.extra[SkipAccountAuth.key] == true ||
        options.extra[_retriedKey] == true ||
        sent == null) {
      return handler.next(err);
    }
    if (!await client.refresh(staleToken: sent)) return handler.next(err);
    options.extra[_retriedKey] = true;
    options.headers[authorizationHeader] = bearer(client.accessToken!);
    try {
      handler.resolve(await dio.fetch<Object?>(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
