# gsainfoteam_account

[![pub](https://img.shields.io/pub/v/gsainfoteam_account?color=0175C2)](https://pub.dev/packages/gsainfoteam_account)

인포팀 계정(IdP) 로그인을 Flutter 앱에 붙입니다. 시스템 브라우저로 IdP에 로그인하고, 서비스 백엔드가 발급한 세션을 보안 저장소에 둡니다.

> **서비스 백엔드가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)의 로그인, 갱신, 로그아웃 endpoint를 구현해야 합니다.** 이 패키지는 그 endpoint를 `transport: 'body'`로 호출합니다.

## 설치

```bash
flutter pub add gsainfoteam_account
```

1. iOS와 Android에서 redirect URI의 scheme을 받도록 [flutter_web_auth_2 설정](https://pub.dev/packages/flutter_web_auth_2#setup)을 따릅니다.
2. IdP에도 같은 redirect URI(`pot-g://callback` 같은 형태)를 등록합니다.
3. 세션은 [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage)에 저장하므로 플랫폼별 설정(Android minSdk 23, macOS Keychain Sharing 등)을 따릅니다. 다른 저장소를 쓰려면 `store`에 `TokenStore`를 넘깁니다.

## 사용

### 클라이언트 생성

```dart
final account = AccountClient(
  issuer: AccountIssuer.production,
  clientId: 'pot-g',
  redirectUri: Uri.parse('pot-g://callback'),
  api: Uri.parse('https://api.pot-g.gistory.me'), // 서비스 백엔드 주소
  loginBody: () async => {'device_id': await deviceId()}, // 선택. code 로그인 요청에 함께 보낼 값
);

await account.restore(); // 앱을 시작할 때 저장해 둔 세션을 불러온다
account.states.listen((state) => print(state.status)); // loading, authenticated, unauthenticated
```

- `issuer`에는 `AccountIssuer.production`, `AccountIssuer.staging`, `AccountIssuer.custom(Uri)`를 씁니다.
- `scopes`를 생략하면 IdP에 등록한 필수 scope와 선택 scope를 모두 요청합니다. SDK가 모르는 scope는 뺍니다. `openid`는 항상 함께 요청합니다.
- `restore()`는 저장된 access token을 확인하지 않고 불러옵니다. 만료된 토큰이면 첫 요청이 401을 받을 때 갱신합니다.
- 백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `paths: SessionPaths(...)`로 줍니다.
- 로그인 흐름은 웹과 같습니다. 앱에는 쿠키가 없으므로 refresh token을 body로 주고받습니다.

### 로그인

```dart
try {
  await account.login();
} on AccountCancelledException {
  // 사용자가 브라우저를 닫았다
} on AccountSessionRejectedException catch (error) {
  // 서비스 백엔드가 약관 동의 같은 추가 입력을 요구했다. 이유는 error.body 에 있다
  if (!account.canRetryLogin) rethrow;
  await account.retryLogin({'agreedToTerms': true}); // loginBody 는 다시 보내지 않으므로 필요한 값은 여기에 넣는다
}
```

실패하면 sealed class인 `AccountException`의 하위 타입을 던집니다. 아래 타입을 모두 다루면 `switch`가 exhaustive 검사를 통과합니다.

| 예외                              | 뜻                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountCancelledException`       | 사용자가 브라우저를 닫았거나 IdP 화면에서 취소했습니다                                                                                                                                                                                 |
| `AccountDeniedException`          | IdP가 거절했습니다. 사용자가 필수 정보를 인증하지 않았거나(`reason`이 `verificationRequired`) 다른 이유입니다(`other`, `description`)                                                                                                  |
| `AccountStateMismatchException`   | callback의 `state`가 보낸 값과 다릅니다                                                                                                                                                                                                |
| `AccountMissingCodeException`     | callback에 code가 없습니다                                                                                                                                                                                                             |
| `AccountIssuerMismatchException`  | callback의 `iss`가 discovery 문서의 issuer와 다릅니다. `issuer`에는 받은 `iss`가 있습니다                                                                                                                                              |
| `AccountOAuthException`           | IdP가 OAuth 오류를 돌려줬거나, client 등록 정보를 읽지 못했거나, 지원하지 않는 scope를 요청했습니다(`code`, 원래 문자열은 `error`)                                                                                                     |
| `AccountSessionRejectedException` | 서비스 백엔드가 login이나 refresh에 실패 응답을 줬습니다(`statusCode`, 성공 응답에 토큰이 없으면 `null`). 403이면서 ticket이 있으면(`canRetryLogin`) `body`에 거절 응답의 `details`가 담기고, `retryLogin(body)`로 이어 갈 수 있습니다 |
| `AccountNetworkException`         | IdP나 서비스 백엔드에 연결하지 못했습니다                                                                                                                                                                                              |
| `AccountDiscoveryException`       | discovery 문서를 읽지 못했거나 필수 값이 없습니다                                                                                                                                                                                      |

`AccountException`이 아닌 예외도 그대로 전파되므로, 이 경우도 따로 처리합니다.

- 브라우저가 취소 이외의 이유로 던진 `PlatformException`
- `loginBody`가 던진 예외
- 이어 갈 로그인이 없을 때 `retryLogin`이 던지는 `StateError`
- `dispose()` 한 뒤에 호출하면 던지는 `StateError`
- 보안 저장소가 던진 `PlatformException`

### API 요청

[dio](https://pub.dev/packages/dio) 클라이언트에 `AccountInterceptor`를 붙입니다.

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.pot-g.gistory.me'));
dio.interceptors.add(AccountInterceptor(account, dio));
```

- `AccountInterceptor`는 access token을 붙여 요청하고, 토큰을 붙인 요청이 401을 받으면 토큰을 한 번 갱신한 뒤 다시 보냅니다. 여러 요청이 동시에 401을 받아도 갱신은 한 번만 합니다.
- 주소와 상관없이 토큰을 붙이므로 서비스 백엔드용 `Dio`에만 붙입니다.
- 갱신이 401이나 403을 받으면 세션을 지우고 `unauthenticated`가 됩니다. 네트워크나 서버 오류로 갱신하지 못하면 세션은 남고, `DioException.error`에 `AccountException`이 담깁니다.
- 토큰 없이 보낼 요청에는 `Options(extra: SkipAccountAuth.extra)`를 붙입니다.

### 로그아웃

```dart
await account.logout(); // 서비스 세션만 끝낸다
await account.logout(idp: true); // 브라우저에서 IdP 로그인 세션까지 끝낸다
```

- 둘의 차이는 [로그아웃](https://github.com/gsainfoteam/account-sdk#로그아웃)에 있습니다.
- `idp: true`이면 IdP 로그아웃 페이지를 연 뒤 `redirectUri`로 돌아옵니다.
- IdP가 로그아웃 endpoint를 제공하지 않거나 사용자가 브라우저를 닫으면 서비스 세션만 끝나고 IdP 로그인 세션은 남습니다. 이때 `logout(idp: true)`는 에러 없이 끝나므로, 앱은 `redirectUri`로 돌아오는 것을 전제로 동작하지 않아야 합니다.
- discovery 문서를 읽지 못하면 `logout(idp: true)`는 서비스 세션을 끝낸 뒤 `AccountNetworkException`이나 `AccountDiscoveryException`을 던집니다.
- 로그아웃한 뒤의 첫 `login()`은 IdP 로그인 화면을 다시 띄웁니다(`prompt=login`).
