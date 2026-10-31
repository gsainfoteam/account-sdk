# @gsainfoteam/account-testing

인포팀 계정(IdP)을 메모리에서 흉내 내는 테스트용 가짜 IdP다. 서비스 백엔드의 e2e 테스트에서 진짜 IdP 없이 로그인부터 guard, 갱신, 로그아웃까지
돌려 볼 수 있다.

진짜 IdP와 같이 동작하는 것:

- discovery, token, userinfo, JWKS, revocation endpoint와 `GET /client/:id/public`
- code는 한 번만 교환할 수 있다. PKCE와 `redirect_uri`, client secret을 확인한다.
- id_token은 ES256으로 서명하고, `iss`, `aud`, `nonce`, `auth_time`, `amr`를 싣는다.
- 사용자 필드는 client가 받은 scope만큼만 준다.

## 설치

GitHub Packages에서 배포한다. 먼저 [설치 인증](../../README.md#설치-인증)을 설정한다.

```bash
pnpm add -D @gsainfoteam/account-testing
```

ESM으로만 배포한다. jest라면 [account-nest의 jest 설정](../nest/README.md#설치)에 이 패키지와 `@faker-js/faker`도 변환 대상으로 넣는다.

## 사용

SDK는 `fetch`를 따로 받지 않으면 전역 `fetch`를 쓴다. 테스트에서 전역 `fetch`를 가짜 IdP로 바꾸고 앱을 띄운다.

```ts
import { createFakeIdp, fakeUser, type FakeIdp } from '@gsainfoteam/account-testing';

let idp: FakeIdp;

beforeAll(async () => {
  idp = await createFakeIdp({
    clients: [{ clientId: 'ziggle', clientSecret: 'secret', scopes: ['name', 'email'] }],
  });
  jest.spyOn(globalThis, 'fetch').mockImplementation(idp.fetch);
  // 그다음 앱을 띄운다
});

it('logs in', async () => {
  const { body } = await idp.authorize({
    clientId: 'ziggle',
    user: fakeUser({ name: '홍길동' }),
  });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ ...body, transport: 'body' });
  expect(res.status).toBe(200);
});
```

- `authorize()`는 브라우저가 IdP에서 로그인하고 돌아온 상태를 만든다. 돌려받은 `body`를 그대로 서비스의 `/auth/login`에 보내면 된다.
- `user`를 생략하면 모든 필드가 채워진 무작위 사용자(`fakeUser()`)로 로그인한다.
- `clients`를 생략하면 어떤 client id와 secret이든 받는다. 넘기면 등록 정보가 서비스 선언과 맞는지 시작할 때 확인하는 것까지 시험할 수 있다.
- 가짜 IdP는 host를 보지 않고 경로만 본다. IdP 경로가 아니면 404를 주므로, 테스트에서 다른 외부 API도 부른다면 주소를 보고 원래 `fetch`로 넘긴다.

`AccountModule.forRoot()`를 테스트에서 직접 만든다면 전역 `fetch`를 바꾸지 않고 `fetch: idp.fetch`를 옵션으로 넘겨도 된다.
