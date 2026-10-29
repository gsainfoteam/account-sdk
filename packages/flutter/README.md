# gsainfoteam_account

인포팀 계정(IdP) 로그인을 Flutter 앱에 붙인다. 시스템 브라우저로 IdP에 로그인하고, 서비스 백엔드가 발급한 세션을 보안 저장소에 둔다.

서비스 백엔드에는 [`@gsainfoteam/account-nest`](../nest)의 세션 모듈이 있어야 한다. 이 패키지는 그 백엔드의 로그인, 갱신, 로그아웃 endpoint를 호출한다.

## 설치

```bash
flutter pub add gsainfoteam_account
```

iOS와 Android에서 redirect URI의 scheme을 받도록 [flutter_web_auth_2 설정](https://pub.dev/packages/flutter_web_auth_2#setup)을 따른다.
IdP에도 같은 redirect URI(`pot-g://callback` 같은 형태)를 등록한다.

## 사용

### 클라이언트 생성

```dart
final account = AccountClient(
  issuer: AccountIssuer.production,
  clientId: 'pot-g',
  redirectUri: Uri.parse('pot-g://callback'),
  api: Uri.parse('https://api.pot-g.gistory.me'), // 서비스 백엔드 주소
  loginBody: () async => {'device_id': await deviceId()}, // 선택. 로그인 요청에 함께 보낼 값
);

await account.restore(); // 앱을 시작할 때 저장해 둔 세션을 불러온다
account.states.listen((state) => print(state.status)); // loading, authenticated, unauthenticated
```

- `scopes`를 생략하면 IdP에 등록한 필수 scope와 선택 scope를 모두 요청한다. `openid`는 항상 함께 요청한다.
- 백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `paths: SessionPaths(...)`로 준다.
- 로그인 흐름은 웹과 같다. 다만 앱에는 쿠키가 없으므로 refresh token을 body로 주고받는다.

### 로그인

```dart
try {
  await account.login();
} on AccountCancelledException {
  // 사용자가 브라우저를 닫았다
} on AccountSessionRejectedException catch (error) {
  // 서비스 백엔드가 약관 동의 같은 추가 입력을 요구했다. 이유는 error.body 에 있다
  await account.retryLogin({'agreedToTerms': true});
}
```

실패하면 sealed class인 `AccountException`의 하위 타입을 던지므로, `switch`로 경우를 모두 처리할 수 있다.

| 예외                              | 뜻                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `AccountCancelledException`       | 사용자가 브라우저를 닫았다                                                       |
| `AccountDeniedException`          | IdP가 거절했다. 사용자가 취소했거나 필수 정보를 인증하지 않았다(`reason`)        |
| `AccountSessionRejectedException` | 서비스 백엔드가 로그인을 거절했다. `retryLogin(body)`로 이어 갈 수 있다          |
| `AccountNetworkException`         | IdP나 서비스 백엔드에 연결하지 못했다                                            |

### API 요청

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.pot-g.gistory.me'));
dio.interceptors.add(AccountInterceptor(account, dio));
```

- `AccountInterceptor`는 access token을 붙여 요청하고, 401을 받으면 토큰을 한 번 갱신한 뒤 다시 보낸다. 여러 요청이 동시에 401을 받아도 갱신은 한 번만 한다.
- 토큰 없이 보낼 요청에는 `Options(extra: SkipAccountAuth.extra)`를 붙인다.

### 로그아웃

```dart
await account.logout(); // 서비스 세션만 끝낸다
await account.logout(idp: true); // 브라우저에서 IdP 로그인 세션까지 끝낸다
```

둘의 차이는 [로그아웃](../../README.md#로그아웃)에 있다. `idp: true`이면 로그아웃이 끝난 뒤 `redirectUri`로 돌아온다.
