# @gsainfoteam/account-testing

테스트용 가짜 인포팀 계정(IdP). 프로세스 안에서 돌고, SDK 옵션의 `fetch` 로 붙인다. 서비스 백엔드가 스테이징 IdP 없이
`/auth/login` 부터 guard 까지 실제 흐름 그대로 테스트할 수 있다.

```bash
pnpm add -D @gsainfoteam/account-testing
```

```ts
const idp = await createFakeIdp({
  clients: [{ clientId: 'c', clientSecret: 's', scopes: ['name'] }], // 생략하면 어떤 client 든 받는다
});

const moduleRef = await Test.createTestingModule({
  imports: [
    AccountModule.forRoot({
      issuer: 'production',
      clientId: 'c',
      clientSecret: 's',
      fetch: idp.fetch,
      session,
    }),
  ],
}).compile();

// 사용자가 account-fe 에서 로그인하고 동의한 것처럼 code 를 만든다. body 는 프론트 SDK 가 보내는 것과 같다
const { body, user } = await idp.authorize({ clientId: 'c' });
await request(app.getHttpServer()).post('/auth/login').send(body).expect(200);

// 검사할 값은 고정한다
await idp.authorize({ clientId: 'c', user: fakeUser({ is_student_id_verified: false }) });
```

- discovery, JWKS, token(authorization code 와 client credentials), userinfo, `GET /client/:id/public` 에 응답한다.
- code 는 한 번만 교환되고, PKCE, redirect URI, client secret 을 진짜 IdP 처럼 확인한다. id_token 은 ES256 으로 서명한다.
- `user` 를 생략하면 [faker](https://fakerjs.dev) 로 모든 claim 이 채워진 사용자(한국어 이름, `@gm.gist.ac.kr` 이메일, 학번, 전화번호)를 만든다.
  faker 는 jest 에서도 불러올 수 있게 CommonJS 를 함께 내는 9.x 를 쓴다.
- id_token 과 userinfo 에는 동의한 scope 의 claim 만 들어간다. `authorize` 의 `amr`, `authTime` 으로 2FA 확인 같은 경우도 만든다.
