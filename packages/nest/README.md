# @gsainfoteam/account-nest

NestJS 백엔드를 인포팀 계정(IdP)에 붙인다. [`@gsainfoteam/account-server`](../server) 를 Nest 모듈로 감쌌다.
ziggle-be, house-moving-out-be, pot-g-be 가 각자 갖고 있던 `infoteam-idp` 라이브러리를 대신한다.

## 설치

GitHub Packages 에서 배포한다. 인증 설정은 [`@gsainfoteam/account-react` README](../react/README.md#설치) 와 같다.

```bash
pnpm add @gsainfoteam/account-nest zod
```

ESM 으로만 배포한다. CommonJS(`module: commonjs`) 로 빌드하는 Nest 앱도 Node 20.19 이상이면 `require()` 로 그대로 불러온다.
Bun 은 버전 제한이 없다.

jest 는 ESM 을 `require()` 하지 못하므로, SDK 와 그 의존성(jose, oauth4webapi)만 변환하게 한다. 나머지 설정은 그대로 둔다.

```js
// jest 설정
transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { allowJs: true } }] },
transformIgnorePatterns: ['/node_modules/(?!\\.pnpm|@gsainfoteam|jose|oauth4webapi)'],
```

## 등록

정적인 것(scope, 세션 claim 의 모양)은 `defineAccount` 에, 환경마다 다르거나 DI 가 필요한 것(secret, store, 사용자 저장)은 `forRootAsync` 에 둔다.

```ts
// account.ts
import { defineAccount, type SessionOf } from '@gsainfoteam/account-nest';
import { z } from 'zod';

export const account = defineAccount({
  requiredScopes: ['name', 'email'], // client 에 필수로 등록한 scope
  session: { claims: z.object({ devicePk: z.number() }) }, // 선택. access token 에 실을 값
});
export const { AccountModule, AccountService, SessionGuard, OptionalSessionGuard } = account;
export type AccountService = InstanceType<typeof AccountService>;
export type Session = SessionOf<typeof account>;
```

```ts
// app.module.ts
AccountModule.forRootAsync({
  isGlobal: true,
  imports: [UsersModule],
  inject: [ConfigService, UsersService, PrismaService],
  useFactory: (config: ConfigService, users: UsersService, prisma: PrismaService) => ({
    issuer: 'production',
    clientId: config.getOrThrow('ACCOUNT_CLIENT_ID'),
    clientSecret: config.getOrThrow('ACCOUNT_CLIENT_SECRET'),
    session: {
      secret: config.getOrThrow('SESSION_SECRET'), // 32자 이상
      store: prismaSessionStore(prisma.accountSession),
      resolve: async (user, { body }) => {
        const local = await users.upsertByIdp(user); // user.email 은 string
        return { subject: local.id, claims: { devicePk: Number(body.device_id) } };
      },
    },
  }),
}),
```

```ts
// 보호할 라우트
@Get('me')
@UseGuards(SessionGuard)
me(@CurrentSession() session: Session) {
  return session.sub; // resolve 가 돌려준 subject. session.sid, session.devicePk 도 있다
}
```

- `export type AccountService` 줄은 꼭 같이 쓴다. 구조 분해로 꺼낸 클래스는 그 줄이 있어야 타입으로 쓸 수 있고, `@Inject` 없이 생성자 타입만으로 주입된다.
- guard 를 다른 모듈의 controller 에서 쓰려면 `isGlobal: true` 로 등록한다.
- 옵션이 비어 있으면 첫 요청을 받을 때가 아니라 앱이 뜰 때 실패한다.
- 앱이 뜰 때 IdP 에 등록한 client 를 읽어, `requiredScopes` 가 모두 필수 scope 인지, `clientCredentialsScopes` 가 등록되어 있는지,
  인증 방식이 `client_secret_post` 인지 확인한다. 맞지 않으면 앱이 뜨지 않는다. `verifyRegistration: 'warn'` 이면 로그만 남기고,
  IdP 에 닿지 못하면 어느 쪽이든 로그만 남긴다.

## 서비스 세션

`session` 을 정의하면 모듈이 `POST /auth/login`, `/auth/refresh`, `/auth/logout` 을 갖는다. 웹과 Flutter SDK 가 이 endpoint 를 부른다.
경로를 바꾸려면 `session: { paths: { refresh: '/auth/refresh-token' } }` 처럼 준다.

- **로그인:** 프론트가 보낸 code 를 confidential client 로 교환하고, id_token 으로 사용자를 확인한 뒤 `resolve` 를 부른다.
  body 에서 프로토콜 필드(`code`, `code_verifier` 같은 것)를 뺀 나머지가 `resolve` 의 `body` 로 간다.
- **access token:** HS256 JWT 다. `sub`(resolve 의 subject), `sid`(로그인 한 번의 id), `claims` 가 들어간다. 기본 수명은 15분이다.
- **refresh token:** 무작위 값이고 store 에는 SHA-256 해시만 둔다. refresh 할 때마다 교체한다.
  이미 쓰인 토큰이 10초 넘게 지나 다시 오면 탈취로 보고 그 로그인의 토큰을 모두 지운다. 10초 안이면 탭 두 개가 동시에 refresh 한 것으로 보고 새 토큰을 준다.
- **전달:** 웹은 refresh token 을 `HttpOnly; Secure; SameSite=Strict` 쿠키로 받고, 쿠키의 `Path` 는 refresh endpoint 의 디렉터리다.
  앱(`transport: 'body'`)은 body 로 주고받는다. Express 와 Fastify 모두에서 동작한다.
- **로그인 전 추가 입력:** `resolve` 에서 `throw new SessionRejected(details)` 하면 클라이언트는 403 과 `details`, ticket 을 받는다.
  클라이언트가 `retryLogin(body)` 를 부르면 ticket 으로 같은 사용자의 `resolve` 가 다시 불린다. ticket 은 `secret` 에서 유도한 키로 암호화했고 5분 동안 유효하다.
- **단일 세션:** `onLogin: 'replace'` 면 로그인할 때 같은 subject 의 다른 세션을 모두 끝낸다.
- **WebSocket 같은 곳:** guard 대신 `account.verifySession(accessToken)` 을 부른다.
- **2FA, 최근 재인증:** 세션에는 사용자가 IdP 에 언제(`auth_time`, 초), 어떻게(`amr`: 비밀번호 `pwd`, 패스키 `hwk`) 로그인했는지가 있다.
  refresh 해도 처음 로그인 값이 이어진다. 민감한 작업 앞에서 이 값을 확인하고, 모자라면 프론트가 `login({ prompt: 'login' })` 으로 다시 로그인하게 한다.

### store

Prisma 를 쓰면 모델을 추가하고 `prismaSessionStore(prisma.accountSession)` 를 넘긴다.

```prisma
model AccountSession {
  tokenHash String    @id
  sessionId String
  subject   String
  claims    Json
  expiresAt DateTime
  usedAt    DateTime?

  @@index([sessionId])
  @@index([subject])
  @@index([expiresAt])
}
```

만료된 행은 지우지 않으므로 주기적으로 `prisma.accountSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })` 를 돌린다.

Redis(ioredis)를 쓰면 `redisSessionStore(redis)` 를 넘긴다. 키는 토큰과 함께 만료되므로 따로 지울 것이 없다.
`isActive` 도 구현되어 있어서 guard 가 요청마다 `EXISTS` 를 한 번 부르고, 로그아웃한 세션의 access token 을 바로 막는다.
키 앞에 붙는 값은 `{ prefix }` 로 바꾼다. 기본값은 `account-session:` 이다.

다른 저장소라면 `SessionStore`(`save`, `find`, `markUsed`, `deleteUsed`, `deleteSession`, `deleteSubject`)를 구현한다. `markUsed` 는 원자적이어야 한다.
`isActive(sessionId)` 까지 구현하면 guard 가 요청마다 확인해서, 로그아웃한 세션의 access token 을 만료 전에도 막는다. 테스트에는 `memorySessionStore()` 를 쓴다.

## scope 와 필드 타입

`requiredScopes` 의 필드는 `resolve` 가 받는 사용자와 `loginWithCode` 결과에서 필수 타입이 된다. id_token 에 빠져 있으면 SDK 가 그 자리에서
`missing_claims` 로 실패하므로, `undefined` 가 서비스 코드로 흘러가지 않는다. `getUserInfoBySub` 결과는 `clientCredentialsScopes` 를 따른다.

`requiredScopes` 에는 client 에 **필수로** 등록한 scope 만 넣는다. 사용자가 거부할 수 있는 선택 scope 를 넣으면, 거부한 사용자는 로그인하지 못한다.

scope 가 다른 설정이 여러 개 필요하면 `defineAccount` 를 여러 번 부른다. 호출마다 주입 토큰과 endpoint 가 따로 생기므로, 두 번째부터는 `paths` 를 다르게 준다.

## 세션 없이 쓰기

`session` 을 빼면 endpoint 없이 IdP 클라이언트만 주입받는다.

```ts
constructor(private readonly account: AccountService) {}

findUser(sub: string) {
  return this.account.getUserInfoBySub(sub); // client credentials 토큰은 SDK 가 캐시한다 (clientSecret 필요)
}
```

실패하면 `AccountError` 를 던진다. `code` 로 나눈다. 세션 endpoint 는 이를 HTTP 상태로 바꿔 응답한다(`invalid_grant` 는 401, IdP 장애는 502).

전체 예시는 [`examples/nest`](../../examples/nest) 에 있다.
