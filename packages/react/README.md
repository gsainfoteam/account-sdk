# @gsainfoteam/account-react

인포팀 계정(IdP) 로그인을 React 앱에 붙인다. [`@gsainfoteam/account-web`](../web) 의 export 를 모두 다시 내보내므로 이 패키지 하나만 설치하면 된다.

## 설치

GitHub Packages 에서 배포한다. 프로젝트 루트에 `.npmrc` 를 둔다.

```ini
@gsainfoteam:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` 은 `read:packages` 스코프를 가진 토큰이다.

```bash
gh auth refresh -s read:packages
export NODE_AUTH_TOKEN=$(gh auth token)
pnpm add @gsainfoteam/account-react zod
```

`zod`(4.x)는 peerDependency 다. SDK 가 export 하는 스키마를 앱과 같은 인스턴스로 쓰기 위해서다.
`openapi-fetch` 나 `axios` 어댑터를 쓸 때만 그 라이브러리를 설치한다.

GitHub Actions 에서는 `secrets.GITHUB_TOKEN` 을 쓰고 `permissions` 에 `packages: read` 를 넣는다.

## 사용

### 1. 클라이언트 만들기

```ts
// src/account.ts
import { createAccountClient } from '@gsainfoteam/account-react';

export const account = createAccountClient({
  issuer: 'production',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID,
  api: import.meta.env.VITE_API_URL, // @gsainfoteam/account-nest 세션 모듈이 있는 서비스 백엔드
});
```

- 로그인 흐름은 하나다. 브라우저는 callback 의 code 를 서비스 백엔드에 넘기고, 백엔드가 confidential client 로 교환해 id_token 으로 사용자를 확인한다.
- `scopes` 를 생략하면 IdP 에 등록한 필수와 선택 scope 를 요청한다. `openid` 는 항상 함께 요청한다.
- `redirectUri` 를 생략하면 `/auth/callback` 이다. IdP 에 이 URL 을 등록만 하고, 라우트는 만들지 않는다.
- `silentLogin: true` 면 세션이 없을 때 IdP 에 `prompt=none` 으로 한 번 다녀온다. IdP 에 이미 로그인한 사용자는 화면 없이 로그인되고,
  아니면 에러 없이 비로그인으로 돌아온다. 탭마다 한 번만 시도하고, 로그아웃한 뒤에는 시도하지 않는다. 다녀오는 동안 Provider 의 `fallback` 이 보인다.
- 백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 `api: { baseUrl, paths: { refresh: '/auth/refresh-token' } }` 로 준다.

### 2. Provider

```tsx
<AccountProvider client={account} fallback={<Splash />}>
  <RouterProvider router={router} />
</AccountProvider>
```

- client 는 라우터보다 먼저 만들어야 한다. 위처럼 모듈 최상단에서 만들고 라우트에서 import 하면 된다.
- 페이지가 IdP 의 callback 으로 열리면, client 가 만들어지는 자리에서 주소를 로그인 전 위치로 바꾼다. 라우터는 callback 주소를 보지 않는다.
- `fallback` 은 그 로그인을 마무리하는 동안에만 보인다. 그 밖에는 라우터를 바로 그린다.

### 3. 로그인이 필요한 라우트

라우터의 guard 에서 `requireAuth` 를 부른다. 세션이 있으면 지나가고, 없으면 IdP 로 보낸 뒤 돌아온다.
`returnTo` 에는 라우터가 주는 이동 대상을 넘긴다. 생략하면 현재 주소인데, 클라이언트 쪽 이동 중에는 이전 페이지다.

**TanStack Router** (파일 기반이든 `createRoute` 든 같다)

```ts
// routes/_auth-required/route.tsx
export const Route = createFileRoute('/_auth-required')({
  beforeLoad: ({ location }) => account.requireAuth({ returnTo: location.href }),
  errorComponent: SignInFailed, // callback 이 실패하면 requireAuth 가 그 에러를 던진다
});

// router.ts: 로그아웃이나 세션 만료 뒤 guard 를 다시 돌린다
account.store.subscribe(() => router.invalidate());
```

**React Router** (data router, v6.4 이상)

```ts
const router = createBrowserRouter([
  {
    loader: ({ request }) => account.requireAuth({ returnTo: request.url }),
    errorElement: <SignInFailed />,
    children: [{ path: '/admin', element: <Admin /> }],
  },
]);
account.store.subscribe(() => router.revalidate());
```

7.9 이상에서 middleware 를 켰다면 같은 호출을 client middleware 에 둬도 된다.

**`<Routes>` 컴포넌트 방식이나 라우터가 없는 앱**

```tsx
<RequireAuth fallback={<Loading />}>
  <MyPage />
</RequireAuth>
```

로그인 화면을 따로 두는 앱은 `redirect={false}` 를 넘기고 `fallback` 에 로그인 화면을 둔다.

- `requireAuth` 는 사용자를 보내는 동안 끝나지 않는 Promise 를 돌려준다. 라우터는 그동안 이동 중 화면을 유지한다.
- 이 페이지의 callback 이 실패했으면(사용자가 취소했거나 백엔드가 거절했으면) 다시 IdP 로 보내지 않고 그 에러를 던진다.
  다시 보내면 취소한 사용자가 빠져나갈 수 없기 때문이다. 에러 화면에서 `error.code` 로 나누고, 다시 시도하는 버튼에서 `login()` 을 부른다.
- 다른 origin 의 `returnTo` 는 버린다.

### 4. 상태와 동작

```tsx
const { status, error, login, logout, retryLogin, fetch } = useAccount();
```

- `status`: `loading`, `authenticated`, `unauthenticated` 중 하나다.
- `error.code` 로 실패 이유를 나눈다. 예를 들어 사용자가 IdP 화면에서 취소하면 `user_cancelled` 다.
- 서비스 백엔드가 로그인을 거절하면 `session_rejected` 다. 거절 이유는 `error.details` 에 있다.
  house-moving-out 처럼 약관 동의를 받아야 하면 `retryLogin(body)` 로 동의 내용을 보낸다. IdP 를 다시 거치지 않는다.

### 5. API 요청

`fetch` 는 access token 을 붙이고, 401 을 받으면 한 번 갱신한 뒤 다시 보낸다. 동시에 여러 요청이 401 을 받아도 갱신은 한 번만 한다.

openapi-fetch 를 쓰면 다음과 같다.

```ts
import { createAccountMiddleware } from '@gsainfoteam/account-react/openapi-fetch';

api.use(createAccountMiddleware(account));
```

axios 를 쓰면 다음과 같다.

```ts
import { attachAccount } from '@gsainfoteam/account-react/axios';

attachAccount(instance, account);
```

## 동작 방식

- access token 은 메모리에만 둔다. refresh token 은 서비스 백엔드가 httpOnly 쿠키로 둔다. 새로 고침하면 refresh 로 복구한다.
- 진행 중인 로그인 정보(PKCE verifier, state, nonce)는 state 별 키로 `sessionStorage` 에 둔다. 여러 탭에서 동시에 로그인해도 서로 덮어쓰지 않는다.
- 로그아웃해도 IdP 로그인 세션은 남는다. 그래서 로그아웃 직후 첫 로그인에서는 `prompt=login` 으로 로그인 화면을 띄워 계정을 바꿀 수 있게 한다.
