import 'package:dio/dio.dart';

import '../client/account_client.dart';
import '../constants.dart';
import 'bearer.dart';

/// 요청 옵션에 [extra]를 넣으면 그 요청은 access token 없이 보낸다.
abstract final class SkipAccountAuth {
  static const key = '${AccountConstants.storageNamespace}:skip';
  static const extra = {key: true};
}

const _retriedKey = '${AccountConstants.storageNamespace}:retried';

/// 모든 요청에 access token을 보내고, 401이면 refresh 한 뒤 한 번 다시 시도한다.
///
/// [QueuedInterceptor]를 쓰면 재시도의 에러가 원래 요청의 `onError` 뒤에 줄을 서서 영원히 끝나지 않는다.
/// 동시 refresh는 [AccountClient.refresh]가 막는다.
class AccountInterceptor extends Interceptor {
  AccountInterceptor(this.client, this.dio);

  final AccountClient client;
  final Dio dio;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra[SkipAccountAuth.key] == true) return handler.next(options);

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

    final retryable =
        err.response?.statusCode == AccountConstants.unauthorizedStatus &&
        options.extra[SkipAccountAuth.key] != true &&
        options.extra[_retriedKey] != true &&
        sent != null;
    if (!retryable) return handler.next(err);

    final token = await client.refresh(staleToken: sent) ? client.accessToken : null;
    if (token == null) return handler.next(err);

    options.extra[_retriedKey] = true;
    options.headers[authorizationHeader] = bearer(token);

    try {
      handler.resolve(await dio.fetch<Object?>(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
