# @gsainfoteam/account-testing

[`@gsainfoteam/account-nest`](../nest)를 붙인 서비스 백엔드를 실제 IdP 없이 테스트하는 가짜 IdP다.

## 테스트 대상

`/auth/login`, `/auth/refresh`, `/auth/logout`과 토큰 처리는 SDK가 만들고 SDK에서 테스트한다. 서비스가 테스트할 것은 그 위에 직접 작성한 코드다.

- `resolve`: IdP 사용자를 서비스 DB의 사용자와 제대로 연결하는가. 기존 사용자를 찾지 못해 새로 만들어 버리면 사용자에게는 자기 데이터가 사라진 것처럼 보인다.
- guard를 붙인 API: 로그인하지 않은 요청을 막고, 로그인한 요청에서는 세션으로 사용자를 찾아 동작하는가.
- 서비스 정책: 약관 동의(`SessionRejected`), 한 기기 로그인(`onLogin: 'replace'`) 등.

`resolve`를 실행하려면 `/auth/login`을 거쳐야 하고, `/auth/login`은 IdP와 통신한다. 가짜 IdP는 이 통신에 실제 IdP처럼 응답하므로, 서비스
코드를 실제 로그인 경로 그대로 실행할 수 있다.

| 실제 로그인                                          | 테스트에서                                    |
| ---------------------------------------------------- | --------------------------------------------- |
| 사용자가 브라우저에서 IdP에 로그인하고 code를 받는다 | `idp.authorize()`가 그 결과(code 등)를 만든다 |
| 프론트가 code를 `POST /auth/login`으로 보낸다        | 테스트가 supertest로 보낸다                   |
| SDK가 IdP에서 code를 교환하고 사용자를 확인한다      | 가짜 IdP가 응답한다                           |
| 서비스의 `resolve`가 사용자를 연결하고 세션이 생긴다 | 실제로 실행된다(서비스 코드, 서비스 DB)       |

실제 IdP와의 연동(client 등록, redirect URI)은 확인하지 못하므로, 스테이징 IdP로 한 번은 직접 로그인해 본다.

## 설치

GitHub Packages에서 배포한다. 먼저 [설치 인증](../../README.md#설치-인증)을 설정한다.

```bash
pnpm add -D @gsainfoteam/account-testing
```

ESM으로만 배포한다.

- **vitest:** 그대로 쓴다. 다만 Nest의 생성자 주입은 `emitDecoratorMetadata`가 있어야 동작하므로 `unplugin-swc`를 붙인다(`plugins: [swc.vite()]`).
- **jest:** [account-nest의 jest 설정](../nest/README.md#설치)에 이 패키지와 `@faker-js/faker`도 변환 대상으로 넣는다.

## 예시

서비스 앱을 그대로 띄우고, SDK가 IdP에 보내는 요청만 가짜 IdP로 보낸다. SDK는 `fetch` 옵션이 없으면 전역 `fetch`를 쓰므로 전역 `fetch`를
바꾸면 된다. 서비스 코드는 바꾸지 않는다.

```ts
import { createFakeIdp, fakeUser, type FakeIdp } from '@gsainfoteam/account-testing';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

let idp: FakeIdp;
let app: INestApplication;

beforeAll(async () => {
  idp = await createFakeIdp();
  jest.spyOn(globalThis, 'fetch').mockImplementation(idp.fetch); // vitest는 vi.spyOn

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

/** 사용자가 IdP에서 로그인하고 돌아와 서비스에 로그인한 상태를 만든다. */
async function login(user = fakeUser()) {
  const { body } = await idp.authorize({ clientId: process.env.ACCOUNT_CLIENT_ID!, user });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ ...body, transport: 'body' }); // 'body'면 토큰을 쿠키 대신 응답 body로 받는다
  return res.body.access_token as string;
}

it('기존 사용자는 새로 만들지 않고 같은 행에 연결한다', async () => {
  const existing = await prisma.user.create({ data: { uuid: 'idp-sub-1', name: '홍길동' } });

  await login(fakeUser({ sub: 'idp-sub-1', name: '홍길동' }));

  expect(await prisma.user.count({ where: { uuid: 'idp-sub-1' } })).toBe(1);
  expect(await prisma.user.findUnique({ where: { id: existing.id } })).not.toBeNull();
});

it('로그인해야 내 정보를 볼 수 있다', async () => {
  await request(app.getHttpServer()).get('/me').expect(401);

  const token = await login(fakeUser({ name: '김철수' }));
  await request(app.getHttpServer()).get('/me').set('authorization', `Bearer ${token}`).expect(200);
});
```

`prisma`, `/me`, `uuid` 필드는 서비스마다 다르다. 서비스 env의 `ACCOUNT_CLIENT_ID`와 `ACCOUNT_CLIENT_SECRET`에는 아무 값이나 넣어도 된다.

## API

### `createFakeIdp(options?)`

| 옵션      | 설명                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients` | 등록된 client 목록(`clientId`, `clientSecret`, `scopes`, `optionalScopes`). 생략하면 어떤 client든 허용하고, 모든 scope를 필수로 등록한 것으로 본다 |
| `users`   | client credentials로 조회(`getUserInfoBySub`)할 수 있는 사용자. `authorize()`한 사용자는 자동으로 추가된다                                          |

`clients`를 넘기면 서버가 시작할 때 하는 등록 점검(`requiredScopes`가 필수 scope로 등록됐는가)까지 시험할 수 있다.

### `idp.authorize(options)`

사용자가 IdP에서 로그인하고 돌아온 상태를 만든다. 서비스 `/auth/login`에 보낼 `body`(`code`, `code_verifier`, `redirect_uri`, `nonce`)와 로그인한
`user`를 돌려준다. code는 한 번만 쓸 수 있다.

| 옵션              | 설명                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `clientId`        | 필수. 서비스가 쓰는 client id와 같아야 한다                                                   |
| `user`            | 로그인할 사용자. 생략하면 `fakeUser()`                                                        |
| `scopes`          | 사용자가 동의한 scope. 생략하면 client에 등록된 전부. 선택 scope를 거절한 경우를 만들 때 쓴다 |
| `authTime`, `amr` | 로그인 시각(초)과 방식. 기본값은 현재 시각과 비밀번호(`['pwd']`)                              |

### `fakeUser(overrides?)`

모든 필드(이름, 이메일, 학번, 전화번호 등)가 무작위로 채워진 IdP 사용자다. `sub`처럼 고정할 값만 넘긴다.

### `idp.fetch`

IdP 요청에 응답하는 `fetch`다. host는 확인하지 않고 경로만 확인하며, IdP 경로가 아니면 404를 준다. 테스트에서 다른 외부 API도 호출한다면 주소를 보고 원래
`fetch`로 넘긴다. `AccountModule.forRoot()`를 테스트에서 직접 만든다면 전역 `fetch`를 바꾸지 않고 `fetch: idp.fetch` 옵션으로 넘겨도 된다.
