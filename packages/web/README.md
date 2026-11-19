# @infoteam/account-web

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-web?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-web)

인포팀 계정(IdP) 로그인을 웹 앱에 붙입니다. 특정 프레임워크에 의존하지 않습니다. React 앱이라면 이 패키지를 다시 내보내는 [`@infoteam/account-react`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react)를 씁니다. 이 문서의 내용은 React 앱에도 그대로 적용됩니다.

> **서비스 백엔드가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)을 구현해야 합니다.** 형식이 다른 백엔드는 [`session` 옵션](#session-옵션)으로 붙입니다.

## 설치

```bash
pnpm add @infoteam/account-web zod
```

- [`zod`](https://zod.dev)(4.x)는 peerDependency입니다. SDK가 export 하는 옵션 스키마(`AccountClientOptionsSchema`)를 앱과 같은 인스턴스로 쓰기 위해서입니다.
- [`axios`](https://github.com/axios/axios)는 `@infoteam/account-web/axios` 어댑터를 쓸 때만 설치합니다.

## 사용

```ts
import { createAccountClient } from '@infoteam/account-web';

const account = createAccountClient({ issuer: 'production', clientId, api: apiUrl });

void account.ready(); // callback 이면 백엔드 로그인을 마치고, 아니면 세션을 복구한다
account.store.subscribe((state) => render(state));

await account.login({ returnTo: location.pathname }); // 로그인 버튼
await account.requireAuth({ returnTo: nextUrl }); // 라우터 guard
await account.fetch(`${apiUrl}/me`); // API 요청. 401 이면 토큰을 갱신한 뒤 다시 보낸다
```

### 1. 클라이언트 생성

> [!IMPORTANT]
> **`createAccountClient`는 라우터를 만들기 전에, 모듈 최상단에서 한 번 호출합니다.** 페이지가 callback(`redirectUri`)으로 열렸으면 client는 만들어지는 즉시 주소에서 `code`를 지우고 주소를 로그인 전 위치로 바꿉니다. 라우터가 먼저 주소를 읽으면 callback 주소를 없는 라우트로 보고, 에러 없이 404 화면이나 다른 페이지를 그립니다. 아래처럼 client를 모듈 하나에서 만들고, 라우터를 만드는 파일이 이 모듈을 import 하면 순서가 지켜집니다.

```ts
// src/account.ts
export const account = createAccountClient({
  issuer: 'production',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID,
  api: import.meta.env.VITE_API_URL,
});
```

| 옵션                 | 설명                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`             | `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` origin                                                                                                                                                     |
| `clientId`           | IdP에 등록한 client id                                                                                                                                                                                                       |
| `api`                | 서비스 백엔드 주소. 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `{ baseUrl, paths: { refresh: '/auth/refresh-token' } }`로 줍니다                                                                 |
| `session`            | 백엔드가 세션 프로토콜과 다른 형식이면 `api` 대신 줍니다. [`session` 옵션](#session-옵션) 참고                                                                                                                               |
| `scopes`             | `profile`, `name`, `picture`, `email`, `phone_number`, `student_id` 중에서 고릅니다. 생략하면 IdP에 등록한 필수 scope와 선택 scope를 모두 요청하고, 이를 위해 client 등록 정보를 조회합니다. `openid`는 항상 함께 요청합니다 |
| `redirectUri`        | 생략하면 `/auth/callback`입니다. IdP에 이 URL을 등록합니다. SPA에서는 라우트를 만들지 않고, SDK가 라우터보다 먼저 처리합니다                                                                                                 |
| `app`                | `'spa'`(기본값) 또는 `'mpa'`. [`app` 옵션](#app-옵션) 참고                                                                                                                                                                   |
| `tokenOrigins`       | `account.fetch`가 토큰을 붙일 origin을 `api`의 origin에 더합니다. [토큰을 붙이는 주소](#토큰을-붙이는-주소) 참고                                                                                                             |
| `silentLogin`        | 자동 로그인. 아래 설명 참고                                                                                                                                                                                                  |
| `fetch`              | discovery, client 등록 조회, 세션 요청, `account.fetch`에 쓸 `fetch`. 생략하면 전역 `fetch`                                                                                                                                  |
| `transactionStorage` | 로그인 진행 정보와 자동 로그인 시도 여부를 두는 곳. 기본값은 `sessionStorage`                                                                                                                                                |
| `redirect`           | 페이지를 옮기는 함수. 기본값은 `window.location.assign`이고, 두 번째 인자로 `{ replace: true }`를 받으면 `window.location.replace`를 씁니다. 바꾸더라도 페이지를 떠나야 합니다. [`redirecting`](#2-상태) 참고                |

`api`와 `session` 중 정확히 하나를 줘야 합니다. 옵션이 틀리면 `createAccountClient`가 `invalid_request`를 던집니다.

`silentLogin: true`이면 서비스 세션이 없을 때 화면 없이 IdP를 한 번 거쳐 옵니다.

- 사용자가 다른 인포팀 서비스에서 이미 IdP에 로그인했다면 로그인 버튼을 누르지 않아도 로그인됩니다.
- IdP에 로그인하지 않았거나 동의가 필요하면 에러 없이 비로그인 상태로 돌아옵니다. 그 밖의 실패(예: 백엔드 거절)는 `error`에 남습니다.
- 탭마다 한 번만 시도하고, 로그아웃한 뒤에는 시도하지 않습니다.

#### `app` 옵션

callback 페이지에서 로그인 전 위치로 돌아가는 방법을 정합니다. 서버가 callback 주소에 SPA의 HTML을 돌려주는지, callback 전용 문서를 돌려주는지는 SDK가 알 수 없으므로 앱이 알려 줘야 합니다.

- `'spa'`(기본값): 라우터 하나가 모든 주소를 그리는 앱입니다. client가 주소만 로그인 전 위치로 바꾸고, 라우터가 그 화면을 그립니다. callback 라우트는 만들지 않습니다.
- `'mpa'`: [Astro](https://astro.build)처럼 주소마다 문서를 따로 받는 앱입니다. [MPA](#mpa)를 참고합니다.

SPA에 `'mpa'`를 주면 로그인할 때마다 페이지를 한 번 더 새로 불러옵니다. MPA에 `'spa'`를 주면 주소만 바뀌고 callback 페이지가 그대로 남습니다.

### 2. 상태

상태는 [zustand](https://github.com/pmndrs/zustand)의 vanilla store(`account.store`)에 있으므로, 어느 프레임워크에서든 구독할 수 있습니다.

```ts
const { status, error, redirecting } = account.store.getState();
account.store.subscribe((state, prev) => state.status !== prev.status && rerender());
```

| 값              | 뜻                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `status`        | `loading`, `authenticated`, `unauthenticated` 중 하나. 세션을 복구하는 동안 `loading`입니다                           |
| `accessToken`   | 현재 access token. 없으면 `null`                                                                                      |
| `error`         | 마지막 실패의 `AccountError`. [에러](#4-에러) 참고                                                                    |
| `canRetryLogin` | 거절된 로그인을 `retryLogin(body)`로 이어 갈 수 있는지 나타냅니다. [로그인 전 추가 입력](#5-로그인-전-추가-입력) 참고 |
| `redirecting`   | client가 callback을 처리하거나 페이지가 다른 곳으로 떠나는 중인지 나타냅니다. 아래 설명 참고                          |

`ready()`는 IdP에서 돌아온 로그인을 마무리하거나 세션을 복구하면 끝납니다. 다만 페이지가 곧 떠나는 동안에는 끝나지 않습니다. 자동 로그인으로 IdP에 다녀오는 중이거나, `app: 'mpa'`의 callback 페이지가 로그인 전 위치를 새로 불러오는 중인 경우입니다. `requireAuth()`도 사용자를 IdP로 보내는 동안 끝나지 않아서, 라우터가 이동 중 화면을 유지합니다.

이 동안 `redirecting`이 `true`이므로, 화면과 테스트에서 아무것도 끝나지 않는 이유를 확인할 수 있습니다.

- callback으로 열린 페이지와 자동 로그인을 시도할 페이지는 client를 만들 때부터 `true`이고, `ready()`가 끝나면 `false`가 됩니다.
- `login()`, `requireAuth()`, `logout({ idp: true })`가 페이지를 IdP로 보내면 `true`가 됩니다.
- 뒤로 가기로 페이지가 bfcache에서 돌아오면 `false`가 됩니다. 자동 로그인이나 `app: 'mpa'`의 callback으로 떠났던 페이지는 이때 `ready()`도 끝납니다. 자동 로그인으로 떠났던 페이지는 세션을 한 번 더 복구해서 `status`를 정합니다.
- `redirect` 옵션에 페이지를 떠나지 않는 함수를 주면, bfcache에서 돌아오기 전까지 `true`로 남습니다. 함수가 예외를 던지면 `false`로 돌아갑니다.

화면에서는 `redirecting`인 동안 페이지를 가리고 로딩 화면을 보여 줍니다. React의 `AccountProvider`는 `fallback`으로 이를 처리합니다. `account.isHandlingRedirect()`도 같은 값을 돌려줍니다.

### 3. 로그인과 라우트 보호

```ts
loginButton.onclick = () => account.login(); // 로그인한 뒤 현재 주소로 돌아온다
```

라우터 guard에서는 `requireAuth`를 호출합니다. 세션이 있으면 그대로 통과하고, 없으면 사용자를 IdP로 보냈다가 원래 가려던 페이지로 돌아오게 합니다. 예를 들어 [Vue Router](https://router.vuejs.org)에서는 다음과 같습니다.

```ts
router.beforeEach((to) =>
  to.meta.requiresAuth ? account.requireAuth({ returnTo: to.fullPath }) : undefined,
);
```

- `returnTo`에는 라우터가 주는 이동 대상을 넘깁니다. 생략하면 현재 주소를 쓰는데, 페이지를 이동하는 중에는 현재 주소가 아직 이전 페이지를 가리킵니다.
- 로그아웃이나 세션 만료 뒤에 guard를 다시 돌리려면 `account.store`를 구독하고 `status`가 바뀔 때 라우터에 다시 검사하게 합니다. 토큰만 바뀐 갱신에는 돌리지 않습니다.
- 이 페이지를 연 callback의 로그인이 실패했으면(사용자가 취소했거나 백엔드가 거절했으면) 다시 IdP로 보내지 않고 그 에러를 던집니다. 다시 보내면 취소한 사용자가 IdP 화면으로 계속 되돌아가기 때문입니다. 에러 화면에서 `error.kind`로 경우를 나누고, 다시 시도하는 버튼에서 `login()`을 호출합니다.
- 다른 origin의 `returnTo`는 무시하고, 로그인한 뒤 `/`로 돌아옵니다.

### 4. 에러

**모든 실패는 `store.error`에 남습니다.** 화면은 `error`를 구독해서 그리면 됩니다. reject 하는지는 메서드마다 다릅니다.

- `ready()`는 reject 하지 않습니다. callback이나 세션 복구가 실패해도 `error`를 채우고 끝납니다.
- `login()`과 `retryLogin()`은 `error`를 채운 뒤, 같은 에러로 reject 합니다. `login()`은 IdP로 보내기 전에 실패한 경우(예: IdP에 연결하지 못함)입니다.
- `requireAuth()`는 이 페이지를 연 callback이 실패했으면 그 에러로, IdP로 보내기 전에 실패했으면 `login()`의 에러로 reject 합니다. 라우터의 에러 화면이 이를 받습니다.
- `account.fetch`와 axios 어댑터는 401 뒤의 refresh가 실패하면(네트워크 오류, 5xx) `error`를 채우고 `status`를 `unauthenticated`로 바꾼 뒤, 받은 401 응답을 그대로 돌려줍니다.

`error`는 다음 로그인에 성공하거나 로그아웃하면 지워집니다. 백엔드가 refresh에 세션이 없다고 답하면(401, 403) 실패가 아니므로 `error`는 그대로 두고 `status`만 `unauthenticated`가 됩니다. `retryLogin()`에 이어 갈 로그인이 없거나 기다리는 동안 로그아웃했으면, `error`를 건드리지 않고 `unauthenticated`로 reject 합니다.

`AccountError`는 Dart의 sealed class처럼 여섯 종류 중 하나입니다. 화면에서는 종류로 경우를 나눕니다. `error.code`보다 가짓수가 적어서, 새 코드가 생겨도 화면 분기를 고치지 않아도 됩니다.

| 종류                        | `error.kind`   | 뜻                                                                                     | 해당 `error.code`                                                              |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AccountError.Cancelled`    | `cancelled`    | 사용자가 로그인을 그만뒀습니다. 보통 에러 화면 없이 로그인 버튼만 다시 보여 줍니다     | `user_cancelled`, `access_denied`                                              |
| `AccountError.Verification` | `verification` | 서비스가 필수로 요구한 정보를 사용자가 IdP에서 인증해야 합니다                         | `verification_required`                                                        |
| `AccountError.Rejected`     | `rejected`     | 서비스 백엔드가 로그인을 거절했습니다. `reason`으로 어떤 입력을 받을지 고릅니다        | `session_rejected`                                                             |
| `AccountError.Expired`      | `expired`      | 로그인을 이어 가던 ticket이 만료됐습니다. `login()`으로 처음부터 다시 합니다           | `invalid_ticket`                                                               |
| `AccountError.Network`      | `network`      | IdP나 서비스 백엔드에 연결하지 못했거나 서버가 잠시 응답하지 못합니다. 다시 시도합니다 | `network_error`, `discovery_failed`, `temporarily_unavailable`, `server_error` |
| `AccountError.Unknown`      | `unknown`      | 그 밖의 실패                                                                           | `state_mismatch`, `unknown` 등                                                 |

`instanceof`로 한 종류를 확인하거나, `switch (error.kind)`로 모든 종류를 나눕니다. 어느 쪽이든 그 종류의 타입으로 좁혀집니다. `reason`과 `details`는 `AccountError.Rejected`에만 있습니다.

```ts
import { AccountError } from '@infoteam/account-web';

if (error instanceof AccountError.Rejected && error.reason === 'terms_required') {
  return showTerms(error.details);
}

switch (error.kind) {
  case 'cancelled':
    return showSignInButton();
  case 'rejected':
    return showRejected(error.reason);
  // ...
  default:
    return error satisfies never; // 빠진 종류가 있으면 컴파일 에러가 납니다
}
```

- `instanceof`는 prototype이 아니라 에러의 모양을 보므로, 번들에 SDK가 두 번 들어가도 맞게 동작합니다.
- 하위 종류는 확인용입니다. 에러를 만들 때는 `new AccountError(code, options)`를 쓰고, 코드에 맞는 종류가 만들어집니다.

자주 보는 `error.code`는 다음과 같습니다.

| `error.code`            | 뜻                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `user_cancelled`        | 사용자가 IdP 화면에서 취소했습니다                                                                                   |
| `verification_required` | 서비스가 필수로 요구한 정보(예: 학번)를 사용자가 IdP에서 아직 인증하지 않았습니다                                    |
| `session_rejected`      | 서비스 백엔드가 403으로 로그인을 거절했습니다. 거절 이유는 `AccountError.Rejected`의 `reason`과 `details`에 있습니다 |
| `invalid_ticket`        | `retryLogin`에 쓴 ticket이 만료됐거나 검증에 실패했습니다(백엔드가 `401 { error: 'invalid_ticket' }`로 응답)         |
| `server_error`          | 서비스 백엔드가 5xx로 응답했거나, 성공 응답이 토큰 응답 형식이 아니었습니다                                          |
| `network_error`         | IdP나 서비스 백엔드에 연결하지 못했습니다                                                                            |
| `state_mismatch`        | callback에 맞는 로그인 진행 정보가 없습니다. IdP에서 10분 넘게 머물렀거나 다른 탭에서 callback이 열린 경우입니다     |
| `unknown`               | 서비스 백엔드가 SDK가 모르는 `error`로 4xx 응답을 했거나, `session` 옵션이 `AccountError`가 아닌 에러를 던졌습니다   |

서비스 백엔드의 실패 응답 body에 SDK가 아는 `error` 코드(예: `{ error: 'invalid_request' }`)가 있으면 그 코드를 씁니다.

### 5. 로그인 전 추가 입력

`session_rejected`는 약관 동의처럼 로그인 전에 추가 입력이 필요할 때 씁니다. 백엔드가 준 `reason`(예: `terms_required`)으로 어떤 입력 화면을 보여 줄지 고릅니다. `canRetryLogin`이 `true`이면(거절 응답에 ticket이 있으면) 사용자에게 입력을 받은 뒤 `retryLogin(body)`로 보내 IdP를 다시 거치지 않고 로그인을 마칩니다.

```ts
const account = createAccountClient<{ agreedToTerms: boolean }>({ ... });

await account.retryLogin({ agreedToTerms: true });
```

- `body`의 타입은 `createAccountClient`의 타입 인자로 정합니다. 생략하면 `unknown`입니다.
- `body`는 plain object로 주고, login 요청 body에 펼쳐서 보냅니다.
- 백엔드 쪽은 [거절과 ticket](https://github.com/gsainfoteam/account-sdk#거절과-ticket) 규칙을 참고합니다.

### 6. API 요청

`account.fetch`는 access token을 붙여 요청하고, 401을 받으면 토큰을 한 번 갱신한 뒤 다시 보냅니다. 여러 요청이 동시에 401을 받으면 먼저 성공한 갱신의 토큰을 함께 씁니다.

```ts
const response = await account.fetch(`${API_URL}/me`);
```

- access token은 메모리에만 두고, refresh token은 서비스 백엔드가 httpOnly 쿠키로 관리합니다. 페이지를 새로 고치면 refresh로 세션을 복구합니다.
- `account.fetch`는 전역 `fetch`와 사용법이 같습니다.
- 상대 경로는 `api` 기준이 아니라 현재 페이지 기준이므로 백엔드 주소를 붙여 씁니다.
- `init.body`로 넘긴 `ReadableStream`은 한 번 보내면 다시 읽을 수 없으므로, 401을 받아도 다시 보내지 않고 그 응답을 돌려줍니다. `Request`에 담긴 본문은 `clone()`으로 남겨 두므로 stream이어도 다시 보냅니다.

#### 토큰을 붙이는 주소

`account.fetch`는 `api`의 origin으로 가는 요청에만 access token을 붙이고, 401을 받으면 refresh 합니다. 다른 origin은 토큰 없이 그대로 보내서, 외부 API에 토큰이 새지 않게 합니다. `session` 옵션을 쓰면 페이지 origin이 기준입니다.

토큰을 받아야 하는 백엔드가 더 있으면 `tokenOrigins`에 origin을 더합니다.

```ts
createAccountClient({ ..., api: 'https://api.ziggle.gistory.me', tokenOrigins: ['https://upload.ziggle.gistory.me'] });
```

#### OpenAPI 클라이언트

OpenAPI 명세로 만든 클라이언트([openapi-fetch](https://openapi-ts.dev/openapi-fetch/), [hey-api](https://heyapi.dev))도 `fetch` 옵션에 `account.fetch`를 넘깁니다. 401 뒤의 재시도도 `account.fetch` 안에서 하므로, body가 있는 요청도 그대로 다시 보냅니다.

```ts
// openapi-fetch
import createClient from 'openapi-fetch';

export const api = createClient<paths>({ baseUrl: API_URL, fetch: account.fetch });
```

```ts
// hey-api: openapi-ts 설정의 runtimeConfigPath 가 가리키는 파일
export const createClientConfig = <T>(config: T) => ({
  ...config,
  baseUrl: API_URL,
  fetch: account.fetch,
});
```

#### axios

[axios](https://github.com/axios/axios)는 `fetch` 옵션이 없으므로 어댑터로 interceptor를 붙입니다.

```ts
import { attachAccount } from '@infoteam/account-web/axios';

const detach = attachAccount(instance, account); // detach() 를 부르면 interceptor 를 제거한다
```

### 7. 로그아웃

```ts
await account.logout(); // 서비스 세션만 끝낸다
await account.logout({ idp: true, returnTo: '/' }); // IdP 로그인 세션까지 끝낸다
```

- 둘의 차이는 [로그아웃](https://github.com/gsainfoteam/account-sdk#로그아웃)에 있습니다.
- `idp: true`이면 IdP의 로그아웃 페이지를 거칩니다. 돌아올 때는 IdP에 등록한 callback URL을 거치므로 따로 등록할 URL은 없습니다. `returnTo`는 이때만 쓰고, 다른 origin이면 `/`로 돌아옵니다.
- 로그아웃한 뒤의 첫 `login()`은 IdP 로그인 화면을 다시 띄웁니다(`prompt=login`). 자동 로그인도 다음 로그인 전까지 시도하지 않습니다.
- IdP가 아직 로그아웃 endpoint를 제공하지 않으면 서비스 세션만 끝냅니다.

## 서버 렌더링

`window`가 없는 곳(SSR, 빌드 시 prerender)에서 `createAccountClient`를 호출하면 브라우저 API를 건드리지 않는 client를 돌려줍니다. 그래서 client를 모듈 최상단에서 만들어도 서버에서 import 할 수 있습니다.

- 상태는 계속 `loading`이고 `redirecting`은 `false`이며, `ready()`는 바로 끝납니다. 서버가 그린 HTML에는 로그인 여부를 넣지 않고, 브라우저에서 hydrate 한 뒤 바뀝니다.
- `login`, `retryLogin`, `requireAuth`는 `invalid_request`로 reject 합니다. `logout`은 아무것도 하지 않고, `refresh`는 `null`을 돌려줍니다.
- `fetch`는 토큰을 붙이지 않은 일반 `fetch`입니다.

## MPA

[Astro](https://astro.build)처럼 페이지마다 문서를 새로 받는 앱은 `app: 'mpa'`를 줍니다.

```ts
export const account = createAccountClient({
  issuer: 'production',
  clientId,
  api: apiUrl,
  app: 'mpa',
});
```

- `redirectUri`(기본값 `/auth/callback`)에 페이지를 만들고, client를 import 한 뒤 `account.ready()`를 호출합니다. client를 만들기만 하면 주소만 정리되고, 백엔드 로그인과 로그인 전 위치로의 이동은 `ready()`가 시작합니다. React island에서는 `AccountProvider`가 `ready()`를 호출하므로 따로 부르지 않습니다. 로그인을 마치면 client가 로그인 전 위치를 새로 불러오므로 이 페이지는 잠깐만 보입니다. 그동안 `redirecting`은 `true`입니다.
- 로그인이 실패하면 callback 페이지에 머뭅니다. 여기서 `error`를 보여 주고 다시 로그인할 버튼을 둡니다.
- 정적 호스팅이 `/auth/callback`을 `/auth/callback/`으로 바꿔도 같은 주소로 봅니다.

[`examples/astro`](https://github.com/gsainfoteam/account-sdk/tree/main/examples/astro)에 React island로 만든 예제가 있습니다.

## storage를 막은 브라우저

브라우저가 storage를 막아도(쿠키 차단 설정, sandbox iframe) 이미 있는 세션의 복구와 로그아웃은 그대로 됩니다.

- `sessionStorage`가 막히면 IdP에 다녀오는 동안 로그인 진행 정보를 잃습니다. 그래서 `login()`과 `requireAuth()`는 IdP로 보내지 않고 `unknown`으로 reject 하고, 자동 로그인과 IdP 로그아웃은 건너뜁니다.
- `localStorage`만 막히면 로그아웃 표시를 `sessionStorage`에 둡니다. 같은 탭은 새로고침해도 로그아웃 상태가 유지되지만, 새 탭은 이 표시를 모릅니다. 그래서 서버 로그아웃 요청이 실패해 refresh 쿠키가 남았다면 새 탭에서 세션이 복구될 수 있습니다. 자동 로그인은 건너뜁니다.

## `session` 옵션

`api` 옵션을 쓰면 SDK는 백엔드가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)을 구현했다고 가정합니다. 형식이 다르면 `api` 대신 `session`에 백엔드 호출을 직접 구현해서 넘깁니다. 둘 중 정확히 하나를 줘야 하고, 아니면 `createAccountClient`가 `invalid_request`를 던집니다.

```ts
import { AccountError, createAccountClient, type Session } from '@infoteam/account-web';

const session: Session = {
  async start(credential) {
    if ('ticket' in credential) throw new AccountError('unauthenticated');
    const res = await fetch(`${apiUrl}/oauth/callback`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: credential.code,
        verifier: credential.codeVerifier,
        redirectUri: credential.redirectUri,
        nonce: credential.nonce,
      }),
    });
    if (!res.ok) throw new AccountError('server_error', { status: res.status });
    const { token } = await res.json();
    return { tokens: { accessToken: token } };
  },
  async refresh() {
    const res = await fetch(`${apiUrl}/token`, { method: 'POST', credentials: 'include' });
    if (res.status === 401) return null; // 세션 없음
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    return { accessToken: (await res.json()).token };
  },
  async end() {
    await fetch(`${apiUrl}/signout`, { method: 'POST', credentials: 'include' });
  },
};

const account = createAccountClient({ issuer: 'production', clientId, session });
```

| 메서드                     | 입출력                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(credential, body?)` | callback으로 받은 `code`, `codeVerifier`, `redirectUri`, `nonce`, `iss`를 받습니다. 백엔드는 code를 교환할 때 이 `redirectUri`를 그대로 쓰고, id_token의 `nonce`를 확인해야 합니다. 재시도할 때는 `{ ticket }`과 `body`를 받습니다 |
| `refresh()`                | `{ accessToken, expiresIn? }`를 돌려주고, 세션이 없으면 `null`을 돌려줍니다. 다른 실패는 throw 합니다. throw 해도 로그아웃 상태가 되고, 그 에러가 `error`에 남습니다                                                               |
| `end(accessToken)`         | 백엔드 세션을 끝냅니다. 실패해도 무시합니다                                                                                                                                                                                        |

에러는 `AccountError`로 던져야 `error.code`와 `error.kind`로 경우를 나눌 수 있습니다. 다른 에러는 `unknown`이 됩니다.

로그인 전에 추가 입력을 받으려면 `start`가 `{ rejected: { error, ticket } }`를 돌려줍니다. `error`는 보통 `new AccountError('session_rejected', { reason, details })`이고(`AccountError.Rejected`가 만들어집니다), `ticket`이 없으면 `canRetryLogin`이 `false`입니다. 그러면 `retryLogin(body)`가 `start({ ticket }, body)`를 호출합니다.
