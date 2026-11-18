# @infoteam/account-nest

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-nest?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-nest)

[NestJS](https://nestjs.com) 백엔드를 인포팀 계정(IdP)에 붙입니다. 모듈이 [`@infoteam/account-server`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server)의 IdP 클라이언트를 주입해 주고, 앱이 시작될 때 IdP 등록을 확인합니다.

> **서비스 세션은 직접 구현합니다.** 로그인, 갱신, 로그아웃 endpoint와 guard는 서비스가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)에 맞춰 만듭니다.

## 설치

```bash
pnpm add @infoteam/account-nest zod
```

ESM으로만 배포합니다. CommonJS(`module: commonjs`)로 빌드하는 Nest 앱도 Node 20.19 이상이면 `require()`로 그대로 불러옵니다.

### jest 설정

[jest](https://jestjs.io)는 ESM을 `require()` 하지 못하므로, SDK와 그 의존성([jose](https://github.com/panva/jose), [oauth4webapi](https://github.com/panva/oauth4webapi))만 변환하도록 설정합니다.

```js
// jest 설정
transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { allowJs: true } }] },
transformIgnorePatterns: ['/node_modules/(?!\\.pnpm|@infoteam|jose|oauth4webapi)'],
```

## 모듈 설정

타입을 정하는 정적인 값(scope)은 `defineAccount`에 두고, 환경마다 다른 값(client id, secret)은 `forRoot`나 `forRootAsync`에 둡니다.

```ts
// account.ts
import { defineAccount } from '@infoteam/account-nest';

export const { AccountModule, AccountService } = defineAccount({
  requiredScopes: ['name', 'email'], // client 에 필수로 등록한 scope
  clientCredentialsScopes: ['name'], // getUserInfoBySub 로 조회할 scope. 쓰지 않으면 생략한다
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

> **`export type AccountService` 줄은 반드시 함께 씁니다.** 이 줄이 있어야 구조 분해로 받은 클래스를 타입으로 쓸 수 있고, `@Inject` 없이 생성자 타입만으로 주입됩니다.

- scope 없이 쓸 때는 `defineAccount` 대신 패키지가 내보내는 `AccountModule`, `AccountService`를 바로 써도 됩니다. 이때는 `clientCredentialsScopes`가 없으므로 `getUserInfoBySub`를 쓸 수 없습니다.
- `forRoot`가 받는 값은 `issuer`, `clientId`, `clientSecret?`, `fetch?`, `verifyRegistration?`, `isGlobal?`입니다. 값이 비어 있거나 틀리면 모듈을 만들 때 `invalid_request`를 던집니다.

### 등록 확인

앱이 시작될 때 IdP에 등록한 client 정보를 읽어 아래 항목을 확인합니다.

- `requiredScopes`가 필수 scope로 등록되어 있는지 확인합니다. 선택 scope로 등록되어 있으면 실패합니다.
- `clientCredentialsScopes`는 필수 scope나 선택 scope 중 어느 쪽으로든 등록되어 있으면 됩니다.
- `clientSecret`을 줬으면 인증 방식이 `client_secret_post`인지 확인합니다.

`verifyRegistration`으로 확인에 실패했을 때의 동작을 정합니다.

| 값                | 동작                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `'error'`(기본값) | 등록이 맞지 않거나 IdP가 모르는 client id이면(`invalid_client`) 앱이 시작되지 않습니다 |
| `'warn'`          | 로그만 남깁니다                                                                        |
| `'off'`           | 확인하지 않습니다                                                                      |

IdP에 연결하지 못하는 등 `invalid_client`가 아닌 실패는 `'error'`에서도 로그만 남깁니다.

## 로그인 endpoint

프론트 SDK가 보낸 code를 `loginWithCode`에 넘기면 `loginWithCode`가 code를 IdP와 교환하고 id_token의 `aud`와 `nonce`를 확인한 뒤 사용자를 돌려줍니다. 그 사용자로 서비스 세션을 만듭니다.

```ts
import { toHttpException } from '@infoteam/account-nest';
import { LoginCodeBody } from '@infoteam/account-nest/dto';

@Post('auth/login')
@HttpCode(200)
async login(@Req() req: Request, @Body() body: LoginCodeBody, @Res({ passthrough: true }) res: Response) {
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
    .catch(toHttpException); // 아래 에러 절 참고
  const local = await this.users.upsertByIdp(user); // user.email 은 string
  const { accessToken, refreshToken } = await this.sessions.issue(local.id);

  res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' });
  return { access_token: accessToken };
}
```

갱신, 로그아웃, 앱용 `transport: 'body'`, 거절과 ticket 규칙은 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)에 있습니다. 메모리 저장소로 구현한 예시(ticket 흐름 제외)는 [`examples/nest`](https://github.com/gsainfoteam/account-sdk/tree/main/examples/nest)에 있습니다.

### login body

`@infoteam/account-nest/dto`는 login body를 class-validator와 Swagger 데코레이터가 붙은 클래스로 내보냅니다. [`class-validator`](https://github.com/typestack/class-validator)와 [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction)가 설치되어 있어야 하고, 이 경로를 import 하지 않으면 둘 다 필요 없습니다.

| 클래스          | 필드                                                                      | 대상 서비스                               |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `LoginCodeBody` | `{ code, code_verifier, redirect_uri, nonce, iss?, transport? }`          | ticket 흐름이 없는 서비스                 |
| `LoginBody`     | 위 필드에 `ticket?`을 더합니다. code 필드는 ticket이 없을 때만 검사합니다 | 거절 뒤 ticket으로 다시 로그인하는 서비스 |

ticket과 함께 받는 추가 입력은 상속해서 더합니다.

```ts
class SignupBody extends LoginBody {
  @IsOptional()
  @IsString()
  nickname?: string;
}
```

### 다시 내보내는 값

`@infoteam/account-nest`는 [`@infoteam/account-server`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server)의 export를 모두 다시 내보냅니다. 그래서 아래 값도 `/dto`가 아니라 `@infoteam/account-nest`에서 import 합니다.

- 에러 타입: `AccountError`
- 거절 응답의 형식: `SessionRejectedResponse` 타입, `SESSION_REJECTED` 상수
- wire 형식의 [zod](https://zod.dev) 스키마: `LoginCodeBodySchema`, `LoginTicketBodySchema`, `SessionTokensResponseSchema`

## scope와 필드 타입

`requiredScopes`에 넣은 scope의 필드는 `loginWithCode`가 돌려주는 사용자에서 필수 타입이 됩니다. 예를 들어 `email`을 넣으면 `user.email`은 `string`입니다. id_token에 그 필드가 빠져 있으면 SDK가 `missing_claims`로 실패하므로, `undefined`가 서비스 코드까지 전달되지 않습니다. 다만 `profile`과 `picture`는 사용자가 비워 둘 수 있어서 필수 scope여도 `undefined`일 수 있습니다.

사용자를 다른 함수에 넘길 때는 scope를 다시 적지 않고 `AccountService`에서 타입을 꺼냅니다. 로그인한 사용자와 조회한 사용자는 채워지는 필드가 달라서 타입도 따로 둡니다.

```ts
import { defineAccount, type LoggedInUser, type LookedUpUser } from '@infoteam/account-nest';

export const { AccountModule, AccountService } = defineAccount({
  requiredScopes: ['name', 'email'],
});
export type AccountService = InstanceType<typeof AccountService>;
export type AccountUser = LoggedInUser<AccountService>;
export type FoundUser = LookedUpUser<AccountService>;
```

> **`requiredScopes`에는 client에 필수로 등록한 scope만 넣습니다.** 사용자가 거부할 수 있는 선택 scope를 넣으면, 그 scope를 거부한 사용자는 로그인하지 못합니다.

scope 구성이 다른 설정이 여러 개 필요하면(예: 사용자 앱과 관리자 웹) `defineAccount`를 여러 번 호출합니다. 호출할 때마다 주입 토큰이 따로 생깁니다.

## 다른 사용자 조회

```ts
constructor(private readonly account: AccountService) {}

findUser(sub: string) {
  return this.account.getUserInfoBySub(sub); // clientSecret 과 clientCredentialsScopes 가 필요하다
}
```

메서드 목록은 [`@infoteam/account-server`의 메서드 절](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server#메서드)에 있습니다.

## 에러

SDK는 실패하면 `AccountError`를 던집니다. `toHttpException`이 `code`에 따라 아래 표의 HTTP 예외로 바꿔 던지고, `AccountError`가 아니면 그대로 던집니다. 응답 body는 `{ error: code, error_description }`입니다. 403은 [거절](https://github.com/gsainfoteam/account-sdk#거절과-ticket) 전용이므로 쓰지 않습니다.

| `code`                                                                         | 상태 | 의미                                       |
| ------------------------------------------------------------------------------ | ---- | ------------------------------------------ |
| `invalid_request`                                                              | 400  | 요청 형식이 틀렸습니다                     |
| `network_error`, `server_error`, `discovery_failed`, `temporarily_unavailable` | 502  | IdP에 연결하지 못했거나 IdP가 실패했습니다 |
| `invalid_client`, `unauthorized_client`, `invalid_scope`, `missing_claims`     | 500  | client 등록이나 서버 설정이 틀렸습니다     |
| 그 밖의 code (`invalid_grant`, `invalid_id_token` 등)                          | 401  | 만료되거나 이미 쓴 code, 검증 실패         |

401 중 `insufficient_authentication`은 `maxAge`나 `amr` 조건을 채우지 못한 경우입니다. 프론트는 `login({ prompt: 'login' })`으로 사용자를 다시 로그인시킵니다.

## 테스트

[`@infoteam/account-testing`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/testing)의 가짜 IdP로 진짜 IdP 없이 로그인 endpoint까지 e2e 테스트를 실행합니다.
