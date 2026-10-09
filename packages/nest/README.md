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

```ts
@Module({
  imports: [
    AccountModule.forRootAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        issuer: 'production',
        clientId: config.getOrThrow('ACCOUNT_CLIENT_ID'),
        clientSecret: config.get('ACCOUNT_CLIENT_SECRET'),
        clientCredentialsScopes: ['name', 'email'], // getUserInfoBySub 를 쓸 때만
      }),
    }),
  ],
})
export class AppModule {}
```

옵션이 비어 있으면 첫 요청을 받을 때가 아니라 앱이 뜰 때 실패한다.

## 사용

```ts
@Injectable()
export class AuthService {
  constructor(private readonly account: AccountService) {}

  // A 방식: 프론트가 보낸 IdP access token 확인
  async login(idpAccessToken: string) {
    const user = await this.account.getUserInfo(idpAccessToken);
    return this.issueSession(user);
  }

  // B 방식: 프론트가 넘긴 code 교환 (clientSecret 필요)
  async loginWithCode(code: string, codeVerifier: string, redirectUri: string) {
    const { user } = await this.account.loginWithCode({ code, codeVerifier, redirectUri });
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
await this.account.getUserInfo(token).catch((error) => {
  if (AccountError.is(error, 'invalid_token')) throw new UnauthorizedException();
  throw new BadGatewayException();
});
```

서비스 자체 JWT 발급은 서비스마다 다르므로 SDK 에 넣지 않았다. 전체 예시는 [`examples/nest`](../../examples/nest) 에 있다.
