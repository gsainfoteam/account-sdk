# @infoteam/account-testing

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-testing?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-testing)

[`@infoteam/account-nest`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest)나 [`@infoteam/account-server`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server)를 붙인 서비스 백엔드를 실제 IdP 없이 테스트할 수 있도록 가짜 IdP를 제공합니다.

## 테스트 대상

code 교환과 id_token 검증(`loginWithCode`)은 SDK에서 테스트합니다. 서비스가 테스트할 대상은 그 위에 직접 작성한 코드입니다.

- **사용자 연결:** IdP 사용자를 서비스 DB의 사용자와 제대로 연결하는가. 기존 사용자를 찾지 못해 새로 만들어 버리면 사용자에게는 자기 데이터가 사라진 것처럼 보입니다.
- **세션:** [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)대로 발급, 갱신, 로그아웃하는가.
- **guard를 붙인 API:** 로그인하지 않은 요청을 막고, 로그인한 요청에서는 세션으로 사용자를 찾아 동작하는가.
- **서비스 정책:** 약관 동의(403 거절과 ticket), 한 기기 로그인 등.

이 코드를 실행하려면 `/auth/login`을 거쳐야 하고, `/auth/login`은 IdP와 통신합니다. 가짜 IdP는 이 통신에 실제 IdP처럼 응답하므로, 서비스 코드를 실제 로그인 경로 그대로 실행할 수 있습니다.

| 실제 로그인                                            | 테스트 환경                                     |
| ------------------------------------------------------ | ----------------------------------------------- |
| 사용자가 브라우저에서 IdP에 로그인하고 code를 받습니다 | `idp.authorize()`가 그 결과(code 등)를 만듭니다 |
| 프론트가 code를 `POST /auth/login`으로 보냅니다        | 테스트가 supertest로 보냅니다                   |
| `loginWithCode`가 code를 교환하고 사용자를 확인합니다  | 가짜 IdP가 응답합니다                           |
| 서비스 코드가 사용자를 연결하고 세션을 만듭니다        | 실제로 실행된다(서비스 코드, 서비스 DB)         |

> **가짜 IdP로는 실제 IdP와의 연동(client 등록, redirect URI)을 확인하지 못합니다.** 스테이징 IdP로 한 번은 직접 로그인해 봅니다.

## 설치

```bash
pnpm add -D @infoteam/account-testing
```

ESM으로만 배포합니다.

| 테스트 러너 | 설정                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest      | 그대로 씁니다. Nest의 생성자 주입은 `emitDecoratorMetadata`가 있어야 동작하므로 `unplugin-swc`를 붙인다(`plugins: [swc.vite()]`)                                  |
| jest        | [account-nest의 jest 설정](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest#jest-설정)에 이 패키지와 `@faker-js/faker`도 변환 대상으로 넣습니다 |

## 예시

서비스 앱을 그대로 실행하고, SDK가 IdP에 보내는 요청만 가짜 IdP로 보냅니다. SDK는 `fetch` 옵션이 없으면 전역 `fetch`를 쓰므로 전역 `fetch`를 바꾸면 됩니다. 서비스 코드는 바꾸지 않습니다.

```ts
import { createFakeIdp, fakeUser, type FakeIdp } from '@infoteam/account-testing';
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
    .send({ ...body, transport: 'body' }); // 서비스가 세션 프로토콜대로 구현했다면 refresh token도 body로 온다
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

`prisma`, `/me`, `uuid` 필드는 서비스마다 다릅니다. 서비스 env의 `ACCOUNT_CLIENT_ID`와 `ACCOUNT_CLIENT_SECRET`에는 아무 값이나 넣어도 됩니다.

## API

### `createFakeIdp(options?)`

| 옵션      | 설명                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients` | 등록된 client 목록(`clientId`, `clientSecret`, `scopes`, `optionalScopes`). 생략하면 어떤 client든 허용하고, 모든 scope를 필수로 등록한 것으로 봅니다 |
| `users`   | client credentials로 조회(`getUserInfoBySub`)할 수 있는 사용자. `authorize()`로 로그인한 사용자는 자동으로 추가됩니다                                 |

`clients`를 넘기면 서버가 시작할 때 하는 등록 점검(`requiredScopes`가 필수 scope로 등록됐는가)까지 시험할 수 있습니다.

### `idp.authorize(options)`

사용자가 IdP에서 로그인하고 돌아온 상태를 만듭니다. 서비스 `/auth/login`에 보낼 `body`(`code`, `code_verifier`, `redirect_uri`, `nonce`)와 로그인한 `user`를 돌려줍니다. code는 한 번만 쓸 수 있습니다.

| 옵션              | 설명                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `clientId`        | 필수. 서비스가 쓰는 client id와 같아야 합니다                                                   |
| `user`            | 로그인할 사용자. 생략하면 `fakeUser()`                                                          |
| `scopes`          | 사용자가 동의한 scope. 생략하면 client에 등록된 전부. 선택 scope를 거절한 경우를 만들 때 씁니다 |
| `authTime`, `amr` | 로그인 시각(초)과 방식. 기본값은 현재 시각과 비밀번호(`['pwd']`)                                |

### `fakeUser(overrides?)`

모든 필드(이름, 이메일, 학번, 전화번호 등)가 무작위로 채워진 IdP 사용자입니다. `sub`처럼 고정할 값만 넘깁니다.

### `idp.fetch`

IdP 요청에 응답하는 `fetch`입니다. host는 확인하지 않고 경로만 확인하며, IdP 경로가 아니면 404를 줍니다.

- 테스트에서 다른 외부 API도 호출한다면 주소를 보고 원래 `fetch`로 넘깁니다.
- `AccountModule.forRoot()`를 테스트에서 직접 만든다면 전역 `fetch`를 바꾸지 않고 `fetch: idp.fetch` 옵션으로 넘겨도 됩니다.
