# @infoteam/account-react

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-react?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-react)

인포팀 계정(IdP) 로그인을 React 앱에 붙입니다. [`@infoteam/account-web`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web)의 export를 모두 다시 내보내므로 이 패키지 하나만 설치하면 됩니다.

> **서비스 백엔드가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)의 로그인, 갱신, 로그아웃 endpoint를 구현해야 합니다.** 형식이 다른 백엔드는 [`session` 옵션](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#session-옵션)으로 붙입니다.

## 설치

```bash
pnpm add @infoteam/account-react zod
```

- React 19.2 이상이 필요합니다.
- [`zod`](https://zod.dev)(4.x)는 이 패키지가 포함한 `@infoteam/account-web`의 peerDependency이므로 함께 설치합니다. SDK가 export 하는 스키마를 앱과 같은 인스턴스로 쓰기 위해서입니다.
- `axios` 어댑터를 쓸 때만 [`axios`](https://github.com/axios/axios)를 설치합니다.

## 사용

### 1. 클라이언트 생성

```ts
// src/account.ts
import { createAccountClient } from '@infoteam/account-react';

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
| `session`            | 백엔드가 세션 프로토콜과 다른 형식이면 `api` 대신 줍니다. [`session` 옵션](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#session-옵션) 참고                                                              |
| `scopes`             | `profile`, `name`, `picture`, `email`, `phone_number`, `student_id` 중에서 고릅니다. 생략하면 IdP에 등록한 필수 scope와 선택 scope를 모두 요청하고, 이를 위해 client 등록 정보를 조회합니다. `openid`는 항상 함께 요청합니다 |
| `redirectUri`        | 생략하면 `/auth/callback`입니다. IdP에 이 URL을 등록만 하고, 라우트는 만들지 않습니다. SDK가 라우터보다 먼저 처리합니다                                                                                                      |
| `callbackNavigation` | callback에서 로그인 전 위치로 돌아가는 방법. 기본값 `'history'`는 주소만 바꿉니다. Astro 같은 MPA는 `'document'`를 줍니다. [MPA](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#mpa) 참고                 |
| `tokenOrigins`       | `account.fetch`가 토큰을 붙일 origin을 `api`의 origin에 더합니다. [토큰을 붙이는 주소](#5-api-요청) 참고                                                                                                                     |
| `silentLogin`        | 자동 로그인. 아래 설명 참고                                                                                                                                                                                                  |
| `fetch`              | discovery, client 등록 조회, 세션 요청, `account.fetch`에 쓸 `fetch`. 생략하면 전역 `fetch`                                                                                                                                  |
| `transactionStorage` | 로그인 진행 정보와 자동 로그인 시도 여부를 두는 곳. 기본값은 `sessionStorage`                                                                                                                                                |
| `redirect`           | 페이지를 옮기는 함수. 기본값은 `window.location.assign`이고, 두 번째 인자로 `{ replace: true }`를 받으면 `window.location.replace`를 씁니다                                                                                  |

`api`와 `session` 중 정확히 하나를 줘야 합니다. 옵션이 틀리면 `createAccountClient`가 `invalid_request`를 던집니다.

`silentLogin: true`이면 서비스 세션이 없을 때 화면 없이 IdP를 한 번 거쳐 옵니다.

- 사용자가 다른 인포팀 서비스에서 이미 IdP에 로그인했다면 로그인 버튼을 누르지 않아도 로그인됩니다.
- IdP에 로그인하지 않았거나 동의가 필요하면 에러 없이 비로그인 상태로 돌아옵니다. 그 밖의 실패(예: 백엔드 거절)는 `error`에 남습니다.
- 탭마다 한 번만 시도하고, 로그아웃한 뒤에는 시도하지 않습니다.

### 2. Provider

```tsx
<AccountProvider client={account} fallback={<Splash />}>
  <RouterProvider router={router} />
</AccountProvider>
```

- client는 라우터보다 먼저 만들어야 합니다. client가 callback 주소를 라우터보다 먼저 처리해서 로그인 전 위치로 바꾸기 때문입니다. 위처럼 모듈 최상단에서 만들고 라우트에서 import 하면 됩니다.
- `fallback`은 IdP에서 돌아온 로그인을 마무리하거나 자동 로그인을 시도하는 동안에만 보입니다. 그 밖에는 라우터를 바로 렌더링합니다. `silentLogin`을 켜면, 그 탭에서 자동 로그인을 아직 시도하지 않았을 때는 세션을 복구하는 동안에도 보입니다.
- `useAccount`, `useAccountClient`, `RequireAuth`는 `AccountProvider` 밖에서 쓰면 에러를 던집니다.
- `useAccountClient()`는 Provider에 넘긴 client를 돌려줍니다. `requireAuth`, `refresh`, `getAccessToken`처럼 `useAccount`에 없는 기능을 컴포넌트에서 쓸 때 씁니다.

#### Astro island

island마다 React 트리가 따로 있으므로, island 컴포넌트마다 `AccountProvider`로 감쌉니다. client는 모듈 하나에서 만들어 모든 island가 같은 인스턴스를 씁니다.

- island는 서버에서도 렌더링됩니다. 서버의 client는 계속 `loading`이므로, 로그인 여부에 따라 달라지는 부분은 `isLoading`일 때의 화면을 서버 HTML로 보냅니다.
- callback 페이지의 island는 `client:only="react"`로 둡니다. 브라우저의 client는 처음부터 callback을 처리하는 중이어서 서버 HTML과 첫 화면이 달라지기 때문입니다.
- 설정은 [MPA](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#mpa)와 [`examples/astro`](https://github.com/gsainfoteam/account-sdk/tree/main/examples/astro)를 참고합니다.

### 3. 라우트 보호

라우터의 guard에서 `requireAuth`를 호출합니다. 세션이 있으면 그대로 통과하고, 없으면 사용자를 IdP로 보냈다가 원래 가려던 페이지로 돌아오게 합니다.

`returnTo`에는 라우터가 주는 이동 대상을 넘깁니다. 생략하면 현재 주소를 쓰는데, 페이지를 이동하는 중에는 현재 주소가 아직 이전 페이지를 가리킵니다.

#### TanStack Router

[TanStack Router](https://tanstack.com/router)에서는 파일 기반이든 `createRoute`든 같습니다.

```ts
// routes/_auth-required/route.tsx
export const Route = createFileRoute('/_auth-required')({
  beforeLoad: ({ location }) => account.requireAuth({ returnTo: location.href }),
  errorComponent: SignInFailed, // callback 이 실패하면 requireAuth 가 그 에러를 던진다
});

// router.ts: 로그아웃이나 세션 만료 뒤 guard 를 다시 돌린다. 토큰만 바뀐 갱신에는 돌리지 않는다
account.store.subscribe((state, prev) => state.status !== prev.status && router.invalidate());
```

#### React Router

[React Router](https://reactrouter.com)의 data router(v6.4 이상)에서 씁니다.

```ts
const router = createBrowserRouter([
  {
    loader: ({ request }) => account.requireAuth({ returnTo: request.url }),
    errorElement: <SignInFailed />,
    children: [{ path: '/admin', element: <Admin /> }],
  },
]);
account.store.subscribe((state, prev) => state.status !== prev.status && router.revalidate());
```

7.9 이상에서 middleware를 켰다면 같은 호출을 client middleware에 둬도 됩니다.

#### `<Routes>` 컴포넌트 방식과 라우터 미사용 앱

```tsx
<RequireAuth fallback={<Loading />}>
  <MyPage />
</RequireAuth>
```

로그인 화면을 따로 두는 앱은 `redirect={false}`를 넘기고 `fallback`에 로그인 화면을 둡니다.

`fallback`은 `authenticated`가 아닌 모든 상태에서 보입니다. 세션을 복구하는 동안과 로그인이 실패한 뒤에도 보이므로, 둘을 나누려면 `fallback`에 함수를 넘깁니다. 함수는 `useAccount()`와 같은 값을 받습니다.

```tsx
<RequireAuth
  fallback={({ isLoading, error, login }) =>
    isLoading || !error ? <Loading /> : <SignInFailed error={error} onRetry={() => login()} />
  }
>
  <MyPage />
</RequireAuth>
```

#### 공통 동작

- `requireAuth`는 사용자를 IdP로 보내는 동안 끝나지 않는 Promise를 돌려줍니다. 그동안 라우터는 이동 중 화면을 유지합니다.
- 이 페이지를 연 callback의 로그인이 실패했으면(사용자가 취소했거나 백엔드가 거절했으면) 다시 IdP로 보내지 않고 그 에러를 던집니다. 다시 보내면 취소한 사용자가 IdP 화면으로 계속 되돌아가기 때문입니다. 에러 화면에서 `error.kind`로 경우를 나누고, 다시 시도하는 버튼에서 `login()`을 호출합니다.
- IdP로 보내기 전에 실패하면(discovery나 client 등록 조회 실패) 그 에러로 reject 합니다.
- 다른 origin의 `returnTo`는 무시하고, 로그인한 뒤 `/`로 돌아옵니다.

### 4. 상태와 로그인

```tsx
const { isLoading, isAuthenticated, error, login, logout, retryLogin, fetch } = useAccount();

if (isLoading) return <Loading />;
if (!isAuthenticated) return <button onClick={() => login()}>로그인</button>;
```

| 값                | 뜻                                                                |
| ----------------- | ----------------------------------------------------------------- |
| `status`          | `loading`, `authenticated`, `unauthenticated` 중 하나             |
| `isLoading`       | `status`가 `loading`인지 나타냅니다                               |
| `isAuthenticated` | `status`가 `authenticated`인지 나타냅니다                         |
| `error`           | 마지막 실패의 `AccountError`. 아래 설명 참고                      |
| `accessToken`     | 현재 access token. 없으면 `null`                                  |
| `canRetryLogin`   | 거절된 로그인을 `retryLogin(body)`로 이어 갈 수 있는지 나타냅니다 |

`error`는 IdP에서 돌아온 로그인, 세션 복구, `retryLogin`, `login()`이 실패했을 때 채워지고, 다음 로그인에 성공하거나 로그아웃하면 지워집니다.

- `fetch`나 axios 어댑터가 401 뒤에 한 refresh가 실패해도(네트워크 오류, 5xx) 채워지고, `status`는 `unauthenticated`가 됩니다.
- 백엔드가 refresh에 세션이 없다고 답하면(401, 403) 에러가 아니므로 `error`는 그대로 두고 `status`만 `unauthenticated`가 됩니다.
- `login()`은 IdP로 보내기 전에 실패하면(예: IdP에 연결하지 못함) `error`를 채우고 reject 합니다.

세션을 복구하는 동안에는 `isAuthenticated`도 `false`이므로, 비로그인 화면은 `isLoading`을 먼저 확인한 뒤 보여 줍니다.

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
if (error instanceof AccountError.Rejected && error.reason === 'terms_required') {
  return <Terms details={error.details} />;
}

switch (error.kind) {
  case 'cancelled':
    return <SignInButton />;
  case 'rejected':
    return <Rejected reason={error.reason} />;
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

`session_rejected`는 약관 동의처럼 로그인 전에 추가 입력이 필요할 때 씁니다. 백엔드가 준 `reason`(예: `terms_required`)으로 어떤 입력 화면을 보여 줄지 고릅니다. `canRetryLogin`이 `true`이면(거절 응답에 ticket이 있으면) 사용자에게 입력을 받은 뒤 `retryLogin(body)`로 보내 IdP를 다시 거치지 않고 로그인을 마칩니다. `body`는 plain object로 주고, login 요청 body에 펼쳐서 보냅니다. `retryLogin`이 실패하면 reject 하고, 이어 갈 로그인이 없으면 `unauthenticated`로 reject 합니다. 백엔드 쪽은 [거절과 ticket](https://github.com/gsainfoteam/account-sdk#거절과-ticket) 규칙을 참고합니다.

### 5. API 요청

`fetch`는 access token을 붙여 요청하고, 401을 받으면 토큰을 한 번 갱신한 뒤 다시 보냅니다. 여러 요청이 동시에 401을 받으면 먼저 성공한 갱신의 토큰을 함께 씁니다.

- access token은 메모리에만 두고, refresh token은 서비스 백엔드가 httpOnly 쿠키로 관리합니다. 페이지를 새로 고치면 refresh로 세션을 복구합니다.
- `fetch`는 전역 `fetch`와 사용법이 같습니다.
- access token은 `api`의 origin으로 가는 요청에만 붙이고, 다른 origin은 토큰 없이 그대로 보냅니다. 토큰을 받아야 하는 백엔드가 더 있으면 `tokenOrigins`에 더합니다.
- 상대 경로는 `api` 기준이 아니라 현재 페이지 기준이므로 백엔드 주소를 붙여 씁니다.
- body가 `ReadableStream`인 요청은 401을 받아도 다시 보내지 않습니다.

```ts
const response = await account.fetch(`${API_URL}/me`); // 컴포넌트 안에서는 useAccount().fetch
```

#### OpenAPI 클라이언트

OpenAPI 명세로 만든 클라이언트([openapi-fetch](https://openapi-ts.dev/openapi-fetch/), [hey-api](https://heyapi.dev))도 `fetch` 옵션에 `account.fetch`를 넘깁니다. 401 뒤의 재시도도 `account.fetch` 안에서 하므로, `account.fetch`가 body가 있는 요청도 그대로 다시 보냅니다.

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
import { attachAccount } from '@infoteam/account-react/axios';

const detach = attachAccount(instance, account); // detach() 를 부르면 interceptor 를 제거한다
```

### 6. 로그아웃

```ts
await logout(); // 서비스 세션만 끝낸다
await logout({ idp: true, returnTo: '/' }); // IdP 로그인 세션까지 끝낸다
```

- 둘의 차이는 [로그아웃](https://github.com/gsainfoteam/account-sdk#로그아웃)에 있습니다.
- `idp: true`이면 IdP의 로그아웃 페이지를 거칩니다. 돌아올 때는 IdP에 등록한 callback URL을 거치므로 따로 등록할 URL은 없습니다. `returnTo`는 이때만 쓰고, 다른 origin이면 `/`로 돌아옵니다.
- 로그아웃한 뒤의 첫 `login()`은 IdP 로그인 화면을 다시 띄웁니다(`prompt=login`). 자동 로그인도 다음 로그인 전까지 시도하지 않습니다.
- IdP가 아직 로그아웃 endpoint를 제공하지 않으면 서비스 세션만 끝냅니다.
