# gsainfoteam_account

인포팀 계정(IdP) 로그인을 Flutter 앱에 붙인다. 시스템 브라우저로 PKCE 로그인을 하고, 서비스 백엔드의 세션을 보안 저장소에 둔다.

## 설치

```bash
flutter pub add gsainfoteam_account
```

iOS 와 Android 에서 redirect URI 의 scheme 을 받도록
[flutter_web_auth_2 설정](https://pub.dev/packages/flutter_web_auth_2#setup)을 따른다. IdP 에는 같은 redirect URI(`pot-g://callback` 같은 형태)를 등록한다.

## 사용

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.pot-g.gistory.me'));

final account = AccountClient(
  issuer: AccountIssuer.production,
  clientId: 'pot-g',
  redirectUri: Uri.parse('pot-g://callback'),
  scopes: const [AccountScope.name, AccountScope.email],
  session: BodySession(
    dio: dio,
    paths: const SessionPaths(login: '/api/v1/user/login', refresh: '/api/v1/user/refresh', logout: '/api/v1/user/logout'),
    loginBody: () async => {'device_id': await deviceId()},
  ),
);

await account.restore();
dio.interceptors.add(AccountInterceptor(account, dio));

account.states.listen((state) => print(state.status));

try {
  await account.signIn();
} on AccountCancelledException {
  // 사용자가 취소했다
}
```

- `AccountInterceptor` 는 access token 을 붙이고 401 을 받으면 한 번 갱신한 뒤 다시 보낸다. 동시에 여러 요청이 401 을 받아도 갱신은 한 번만 한다.
- 토큰 없이 보낼 요청은 `Options(extra: SkipAccountAuth.extra)` 를 붙인다.
- 실패는 sealed class `AccountException` 의 하위 타입으로 던진다. `switch` 로 경우마다 처리한다.
- 로그아웃 직후 첫 로그인에서는 `prompt=login` 으로 로그인 화면을 띄워 계정을 바꿀 수 있게 한다.
- PKCE, state 검증, code 교환은 `package:oauth2` 가 맡는다.
