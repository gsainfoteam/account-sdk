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
  api: Uri.parse('https://api.pot-g.gistory.me'), // @gsainfoteam/account-nest 세션 모듈이 있는 서비스 백엔드
  loginBody: () async => {'device_id': await deviceId()},
);

await account.restore();
dio.interceptors.add(AccountInterceptor(account, dio));

account.states.listen((state) => print(state.status));

try {
  await account.login();
} on AccountCancelledException {
  // 사용자가 취소했다
} on AccountSessionRejectedException catch (error) {
  // 서비스가 약관 동의 같은 추가 입력을 요구했다. 이유는 error.body 에 있다
  await account.retryLogin({'agreedToTerms': true});
}
```

- 로그인 흐름은 웹과 같다. callback 의 code 를 서비스 백엔드의 `/auth/login` 에 넘기면, 백엔드가 confidential client 로 교환하고 id_token 으로 사용자를 확인한다.
  refresh token 은 body 로 주고받는다(`transport: 'body'`).
- `scopes` 를 생략하면 IdP 에 등록한 필수와 선택 scope 를 요청한다. `openid` 는 항상 함께 요청한다.
- 백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `paths: SessionPaths(...)` 로 준다.
- `AccountInterceptor` 는 access token 을 붙이고 401 을 받으면 한 번 갱신한 뒤 다시 보낸다. 동시에 여러 요청이 401 을 받아도 갱신은 한 번만 한다.
- 토큰 없이 보낼 요청은 `Options(extra: SkipAccountAuth.extra)` 를 붙인다.
- 실패는 sealed class `AccountException` 의 하위 타입으로 던진다. `switch` 로 경우마다 처리한다.
- 로그아웃 직후 첫 로그인에서는 `prompt=login` 으로 로그인 화면을 띄워 계정을 바꿀 수 있게 한다.
- PKCE(`S256`), `state`, `nonce` 를 직접 만들고, callback 의 `state` 와 `iss` 를 확인한다.
