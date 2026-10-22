# @gsainfoteam/account-nest

NestJS 백엔드를 인포팀 계정(IdP)에 붙인다. [`@gsainfoteam/account-server`](../server) 를 Nest 모듈로 감쌌다.
ziggle-be, house-moving-out-be, pot-g-be 가 각자 갖고 있던 `infoteam-idp` 라이브러리를 대신한다.

## 설치

GitHub Packages 에서 배포한다. 인증 설정은 [`@gsainfoteam/account-react` README](../react/README.md#설치) 와 같다.

```bash
pnpm add @gsainfoteam/account-nest zod
```

CommonJS(`module: commonjs`) 프로젝트에서도 쓸 수 있다. 다만 의존하는 oauth4webapi 와 jose 가 ESM 전용이라 Node 20.19 이상이 필요하다.
Bun 은 버전 제한이 없다.

## 등록

scope 는 코드에 고정하고, issuer 나 secret 처럼 환경마다 다른 값은 모듈을 등록할 때 넘긴다.

```ts
// account.ts
import { defineAccount } from '@gsainfoteam/account-nest';

export const { AccountModule, AccountService } = defineAccount({
  requiredScopes: ['name', 'student_id'], // client 에 필수로 등록한 scope
  clientCredentialsScopes: ['name'], // getUserInfoBySub 를 쓸 때만
});
export type AccountService = InstanceType<typeof AccountService>;
```

```ts
// app.module.ts
@Module({
  imports: [
    AccountModule.forRootAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        issuer: 'production',
        clientId: config.getOrThrow('ACCOUNT_CLIENT_ID'),
        clientSecret: config.get('ACCOUNT_CLIENT_SECRET'),
      }),
    }),
  ],
})
export class AppModule {}
```

- `export type` 줄은 꼭 같이 쓴다. 구조 분해로 꺼낸 클래스는 그 줄이 있어야 타입으로 쓸 수 있고, `@Inject` 없이 생성자 타입만으로 주입된다.
- 옵션이 비어 있으면 첫 요청을 받을 때가 아니라 앱이 뜰 때 실패한다.
- scope 를 선언할 필요가 없으면 `@gsainfoteam/account-nest` 의 `AccountModule` 과 `AccountService` 를 그대로 써도 된다.

## scope 와 필드 타입

`requiredScopes` 의 필드는 `loginWithCode` 결과에서 필수 타입이 된다. id_token 에 빠져 있으면 SDK 가 그 자리에서 `missing_claims` 로 실패하므로,
`undefined` 가 서비스 코드로 흘러가지 않는다. `getUserInfoBySub` 결과는 `clientCredentialsScopes` 를 따른다.

```ts
const { user } = await this.account.loginWithCode(params);
user.studentId; // string
user.email; // string | undefined (선언하지 않은 scope)
```

`requiredScopes` 에는 client 에 **필수로** 등록한 scope 만 넣는다. 사용자가 거부할 수 있는 선택 scope 를 넣으면, 거부한 사용자는 로그인하지 못한다.

scope 가 다른 설정이 여러 개 필요하면 `defineAccount` 를 여러 번 부른다. 호출마다 주입 토큰이 따로 생긴다.

## 사용

```ts
@Injectable()
export class AuthService {
  constructor(private readonly account: AccountService) {}

  // 프론트가 callback 에서 받아 넘긴 code 를 교환하고, id_token 으로 사용자를 확인한다 (clientSecret 필요)
  async login(params: LoginWithCodeParams) {
    const { user } = await this.account.loginWithCode(params);
    return this.issueSession(user);
  }

  // 사용자가 없을 때 조회. client credentials 토큰은 SDK 가 캐시한다 (clientSecret 필요)
  findUser(sub: string) {
    return this.account.getUserInfoBySub(sub);
  }
}
```

실패하면 `AccountError` 를 던진다. `code` 로 나눈다.

```ts
await this.account.loginWithCode(params).catch((error) => {
  if (AccountError.is(error, 'invalid_grant')) throw new UnauthorizedException(); // 이미 쓰였거나 만료된 code
  if (AccountError.is(error, 'missing_claims')) throw new InternalServerErrorException(); // client 의 scope 설정 문제
  throw new BadGatewayException();
});
```

서비스 자체 JWT 발급은 서비스마다 다르므로 SDK 에 넣지 않았다. 전체 예시는 [`examples/nest`](../../examples/nest) 에 있다.
