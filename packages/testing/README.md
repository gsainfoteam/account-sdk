# @gsainfoteam/account-testing

테스트용 가짜 인포팀 계정(IdP). 테스트 프로세스 안에서 동작하며, SDK 옵션의 `fetch`로 연결한다. 서비스 백엔드는 스테이징 IdP 없이
`/auth/login`부터 guard까지 실제 흐름 그대로 테스트할 수 있다.

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

- discovery, JWKS, token(authorization code와 client credentials), userinfo, `GET /client/:id/public`에 응답한다.
- 실제 IdP처럼 code는 한 번만 교환할 수 있고, PKCE와 redirect URI, client secret을 확인한다.
- `user`를 생략하면 [faker](https://fakerjs.dev)로 모든 claim을 채운 사용자(한국어 이름, `@gm.gist.ac.kr` 이메일, 학번, 전화번호)를 만든다.
- id_token과 userinfo에는 동의한 scope의 claim만 들어간다. `authorize`의 `amr`, `authTime`으로 재인증 확인 같은 경우도 만들 수 있다.
- jest 설정은 [`account-nest` README](../nest/README.md#설치)와 같다.
