# @gsainfoteam/account-nest

NestJS 백엔드를 인포팀 계정(IdP)에 붙인다. 모듈이 [`@gsainfoteam/account-server`](../server)의 IdP 클라이언트를 주입해 주고, 앱이 시작될 때 IdP 등록을
확인한다. 서비스 세션(로그인, 갱신, 로그아웃 endpoint와 guard)은 서비스가 [세션 프로토콜](../../README.md#세션-프로토콜)에 맞춰 직접 구현한다.

## 설치

GitHub Packages에서 배포한다. 먼저 [설치 인증](../../README.md#설치-인증)을 설정한다.

```bash
pnpm add @gsainfoteam/account-nest zod
```

ESM으로만 배포한다. CommonJS(`module: commonjs`)로 빌드하는 Nest 앱도 Node 20.19 이상이면 `require()`로 그대로 불러온다.

jest는 ESM을 `require()` 하지 못하므로, SDK와 그 의존성(jose, oauth4webapi)만 변환하도록 설정한다.

```js
// jest 설정
transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { allowJs: true } }] },
transformIgnorePatterns: ['/node_modules/(?!\\.pnpm|@gsainfoteam|jose|oauth4webapi)'],
```

## 모듈 설정

타입을 정하는 정적인 값(scope)은 `defineAccount`에 두고, 환경마다 다른 값(client id, secret)은 `forRoot`나 `forRootAsync`에 둔다.

```ts
// account.ts
import { defineAccount } from '@gsainfoteam/account-nest';

export const { AccountModule, AccountService } = defineAccount({
  requiredScopes: ['name', 'email'], // client 에 필수로 등록한 scope
});
export type AccountService = InstanceType<typeof AccountService>;
```

```ts
// app.module.ts
AccountModule.forRootAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    issuer: 'production',
    clientId: config.getOrThrow('ACCOUNT_CLIENT_ID'),
    clientSecret: config.getOrThrow('ACCOUNT_CLIENT_SECRET'),
  }),
}),
```

- `export type AccountService` 줄은 반드시 함께 쓴다. 이 줄이 있어야 구조 분해로 꺼낸 클래스를 타입으로 쓸 수 있고, `@Inject` 없이 생성자 타입만으로 주입된다.
- scope 없이 쓸 때는 `defineAccount` 대신 패키지가 내보내는 `AccountModule`, `AccountService`를 바로 써도 된다.
- 앱이 시작될 때 IdP에 등록한 client 정보를 읽어 `requiredScopes`, `clientCredentialsScopes`, 인증 방식(`client_secret_post`)이 맞는지 확인한다.
  맞지 않으면 앱이 시작되지 않는다. `verifyRegistration: 'warn'`이면 로그만 남긴다. IdP에 연결하지 못했을 때도 로그만 남긴다.

## 로그인 endpoint

프론트 SDK가 보낸 code를 `loginWithCode`에 넘기면 IdP와 교환하고 id_token의 `aud`와 `nonce`를 확인한 뒤 사용자를 돌려준다. 그 사용자로 서비스 세션을 만든다.

```ts
@Post('auth/login')
@HttpCode(200)
async login(@Req() req: Request, @Body() body: LoginBody, @Res({ passthrough: true }) res: Response) {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== WEB_ORIGIN) throw new BadRequestException('untrusted origin');

  const { user } = await this.account
    .loginWithCode({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
      nonce: body.nonce,
      iss: body.iss,
    })
    .catch(toHttpError); // 아래 에러 절 참고
  const local = await this.users.upsertByIdp(user); // user.email 은 string
  const { accessToken, refreshToken } = await this.sessions.issue(local.id);

  res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' });
  return { access_token: accessToken };
}
```

갱신, 로그아웃, 앱용 `transport: 'body'`, 거절과 ticket 규칙은 [세션 프로토콜](../../README.md#세션-프로토콜)에 있고, 메모리 저장소로 구현한 예시(ticket 흐름 제외)는
[`examples/nest`](../../examples/nest)에 있다.

## scope와 필드 타입

`requiredScopes`에 넣은 scope의 필드는 `loginWithCode`가 돌려주는 사용자에서 필수 타입이 된다. 예를 들어 `email`을 넣으면 `user.email`은 `string`이다.
id_token에 그 필드가 빠져 있으면 SDK가 `missing_claims`로 실패하므로, `undefined`가 서비스 코드까지 전달되지 않는다. 다만 `profile`과 `picture`는 사용자가
비워 둘 수 있어서 필수 scope여도 `undefined`일 수 있다.

`requiredScopes`에는 client에 **필수로** 등록한 scope만 넣는다. 사용자가 거부할 수 있는 선택 scope를 넣으면, 그 scope를 거부한 사용자는 로그인하지 못한다.

scope 구성이 다른 설정이 여러 개 필요하면(예: 사용자 앱과 관리자 웹) `defineAccount`를 여러 번 호출한다. 호출할 때마다 주입 토큰이 따로 생긴다.

## 다른 사용자 조회

```ts
constructor(private readonly account: AccountService) {}

findUser(sub: string) {
  return this.account.getUserInfoBySub(sub); // clientSecret 과 clientCredentialsScopes 가 필요하다
}
```

메서드 목록은 [`@gsainfoteam/account-server` README](../server/README.md)에 있다.

## 에러

SDK는 실패하면 `AccountError`를 던지므로 `code`로 HTTP 상태를 나눈다. 403은 [거절](../../README.md#세션-프로토콜) 전용이므로 다른 실패에 쓰지 않는다.

| `code`                                                                         | 상태 | 의미                                   |
| ------------------------------------------------------------------------------ | ---- | -------------------------------------- |
| `invalid_request`                                                              | 400  | 요청 형식이 틀렸다                     |
| `network_error`, `server_error`, `discovery_failed`, `temporarily_unavailable` | 502  | IdP에 연결하지 못했거나 IdP가 실패했다 |
| `invalid_client`, `unauthorized_client`, `invalid_scope`, `missing_claims`     | 500  | client 등록이나 서버 설정이 틀렸다     |
| 그 밖의 code (`invalid_grant`, `invalid_id_token` 등)                          | 401  | 만료되거나 이미 쓴 code, 검증 실패     |

[`examples/nest`의 `toHttpError`](../../examples/nest/src/auth.controller.ts)가 이 표를 구현한다.

## 테스트

[`@gsainfoteam/account-testing`](../testing)의 가짜 IdP로 진짜 IdP 없이 로그인 endpoint까지 e2e 테스트를 돌린다. 사용법은 [그 README](../testing/README.md)에 있다.
