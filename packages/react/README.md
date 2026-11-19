# @infoteam/account-react

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-react?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-react)

인포팀 계정(IdP) 로그인을 React 앱에 붙입니다. [`@infoteam/account-web`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web)의 export를 모두 다시 내보내므로 이 패키지 하나만 설치하면 됩니다.

이 문서는 React에서만 쓰는 부분을 다룹니다. 옵션, 상태, 에러, API 요청, 로그아웃은 [`account-web` README](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#사용)에 있고 React에서도 같습니다.

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

> [!IMPORTANT]
> **`createAccountClient`는 라우터를 만들기 전에, 모듈 최상단에서 한 번 호출합니다.** 컴포넌트나 hook 안에서 만들지 않습니다. 페이지가 callback으로 열렸으면 client는 만들어지는 즉시 주소를 로그인 전 위치로 바꿉니다. 라우터가 먼저 주소를 읽으면 callback 주소를 없는 라우트로 보고, 에러 없이 404 화면이나 다른 페이지를 그립니다. 아래처럼 client를 모듈 하나에서 만들고, 라우터를 만드는 파일이 이 모듈을 import 하면 순서가 지켜집니다.

```ts
// src/account.ts
import { createAccountClient } from '@infoteam/account-react';

export const account = createAccountClient({
  issuer: 'production',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID,
  api: import.meta.env.VITE_API_URL,
});
```

옵션은 [`account-web`의 클라이언트 생성](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#1-클라이언트-생성)을 참고합니다.

### 2. Provider

```tsx
<AccountProvider client={account} fallback={<Splash />}>
  <RouterProvider router={router} />
</AccountProvider>
```

- `AccountProvider`가 마운트되면 `account.ready()`를 호출해 callback을 처리하거나 세션을 복구합니다.
- `fallback`은 store의 [`redirecting`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#2-상태)이 `true`인 동안 children 대신 보입니다. IdP에서 돌아온 로그인을 마무리하거나 자동 로그인을 시도하는 동안, 그리고 `login()`이나 `logout({ idp: true })`로 페이지가 IdP로 떠나는 동안입니다. 그 밖에는 라우터를 바로 렌더링하므로, 공개 페이지가 세션 복구를 기다리지 않습니다.
- `silentLogin`을 켜면, 그 탭에서 자동 로그인을 아직 시도하지 않았을 때는 세션을 복구하는 동안에도 `fallback`이 보입니다.
- `useAccount`, `useAccountClient`, `RequireAuth`는 `AccountProvider` 밖에서 쓰면 에러를 던집니다.
- `useAccountClient()`는 Provider에 넘긴 client를 돌려줍니다. `requireAuth`, `refresh`, `getAccessToken`처럼 `useAccount`에 없는 기능을 컴포넌트에서 쓸 때 씁니다.

#### Astro island

island마다 React 트리가 따로 있으므로, island 컴포넌트마다 `AccountProvider`로 감쌉니다. client는 모듈 하나에서 만들어 모든 island가 같은 인스턴스를 씁니다.

- island는 서버에서도 렌더링됩니다. 서버의 client는 계속 `loading`이므로, 로그인 여부에 따라 달라지는 부분은 `isLoading`일 때의 화면을 서버 HTML로 보냅니다.
- callback 페이지의 island는 `client:only="react"`로 둡니다. 브라우저의 client는 처음부터 callback을 처리하는 중이어서 서버 HTML과 첫 화면이 달라지기 때문입니다.
- 설정은 [MPA](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#mpa)와 [`examples/astro`](https://github.com/gsainfoteam/account-sdk/tree/main/examples/astro)를 참고합니다.

### 3. 라우트 보호

라우터의 guard에서 `requireAuth`를 호출합니다. 세션이 있으면 그대로 통과하고, 없으면 사용자를 IdP로 보냈다가 원래 가려던 페이지로 돌아오게 합니다. `returnTo`에는 라우터가 주는 이동 대상을 넘깁니다. 동작은 [`account-web`의 로그인과 라우트 보호](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#3-로그인과-라우트-보호)와 같습니다.

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

### 4. 상태와 로그인

```tsx
const { isLoading, isAuthenticated, error, login, logout, retryLogin, fetch } = useAccount();

if (isLoading) return <Loading />;
if (!isAuthenticated) return <button onClick={() => login()}>로그인</button>;
```

`useAccount()`는 store의 [상태](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#2-상태)(`status`, `accessToken`, `error`, `canRetryLogin`, `redirecting`)에 다음 값을 더해 돌려줍니다. 상태가 바뀔 때만 새 객체를 돌려주므로 effect의 의존성으로 써도 됩니다.

| 값                                       | 뜻                                        |
| ---------------------------------------- | ----------------------------------------- |
| `isLoading`                              | `status`가 `loading`인지 나타냅니다       |
| `isAuthenticated`                        | `status`가 `authenticated`인지 나타냅니다 |
| `login`, `logout`, `retryLogin`, `fetch` | client의 같은 이름 메서드                 |

세션을 복구하는 동안에는 `isAuthenticated`도 `false`이므로, 비로그인 화면은 `isLoading`을 먼저 확인한 뒤 보여 줍니다.

에러는 [`account-web`의 에러](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#4-에러)와 같습니다. 모든 실패는 `error`에 남고, `login()`과 `retryLogin()`은 같은 에러로 reject 하기도 합니다.

[로그인 전 추가 입력](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#5-로그인-전-추가-입력)을 받는 화면에서는 `useAccount`에 `retryLogin`의 body 타입을 넘깁니다. 생략하면 `unknown`입니다. hook은 이 타입이 `createAccountClient`에 준 타입과 맞는지 확인하지 않으므로 같은 타입을 씁니다.

```tsx
const { error, retryLogin } = useAccount<{ agreedToTerms: boolean }>();

if (error instanceof AccountError.Rejected && error.reason === 'terms_required') {
  return <Terms onAgree={() => retryLogin({ agreedToTerms: true })} />;
}
```

### 5. API 요청

컴포넌트 안에서는 `useAccount().fetch`를, 밖에서는 `account.fetch`를 씁니다. 둘은 같은 함수입니다. OpenAPI 클라이언트와 axios 어댑터(`@infoteam/account-react/axios`)는 [`account-web`의 API 요청](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#6-api-요청)을 참고합니다.

```ts
const response = await account.fetch(`${API_URL}/me`);
```

### 6. 로그아웃

```ts
const { logout } = useAccount();

await logout(); // 서비스 세션만 끝낸다
await logout({ idp: true, returnTo: '/' }); // IdP 로그인 세션까지 끝낸다
```

`idp: true`이면 페이지가 IdP로 떠나는 동안 `AccountProvider`의 `fallback`이 보입니다. 자세한 동작은 [`account-web`의 로그아웃](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web#7-로그아웃)을 참고합니다.
