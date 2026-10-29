# gsainfoteam_account

인포팀 계정(IdP) 로그인을 Flutter 앱에 붙인다. 시스템 브라우저로 PKCE 로그인을 하고, 서비스 백엔드가 발급한 세션을 보안 저장소에 둔다.

## 설치

```bash
flutter pub add gsainfoteam_account
```

iOS와 Android에서 redirect URI의 scheme을 받도록
[flutter_web_auth_2 설정](https://pub.dev/packages/flutter_web_auth_2#setup)을 따른다. IdP에는 같은 redirect URI(`pot-g://callback` 같은 형태)를 등록한다.

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

- 로그인 흐름은 웹과 같다. 다만 앱에는 쿠키가 없으므로 refresh token을 body로 주고받는다(`transport: 'body'`).
- `scopes`를 생략하면 IdP에 등록한 필수 scope와 선택 scope를 요청한다. `openid`는 항상 함께 요청한다.
- 백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `paths: SessionPaths(...)`로 준다.
- `AccountInterceptor`는 access token을 붙여 요청하고, 401을 받으면 토큰을 한 번 갱신한 뒤 다시 보낸다. 여러 요청이 동시에 401을 받아도 갱신은 한 번만 한다.
- 토큰 없이 보낼 요청에는 `Options(extra: SkipAccountAuth.extra)`를 붙인다.
- 실패하면 sealed class인 `AccountException`의 하위 타입을 던지므로, `switch`로 경우마다 처리한다.
- `logout()`은 IdP 로그인 세션을 남기므로, 그 뒤 첫 로그인에서는 `prompt=login`으로 로그인 화면을 띄워 계정을 바꿀 수 있게 한다.
- `logout(idp: true)`는 브라우저에서 IdP 로그아웃 페이지를 열어 IdP 로그인 세션도 끝낸다. 로그아웃이 끝나면 `redirectUri`로 돌아온다.
