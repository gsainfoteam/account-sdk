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

ziggle 이나 house-moving-out 처럼 브라우저가 IdP 토큰을 받아 백엔드 `/auth/login` 에 넘기는 서비스라면 아래와 같다.

```ts
// src/account.ts
import { cookieSession, createAccountClient } from '@gsainfoteam/account-react';

export const account = createAccountClient({
  issuer: 'production',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID,
  redirectUri: '/auth/callback',
  scopes: ['name', 'email'],
  exchange: 'browser',
  session: cookieSession({ baseUrl: import.meta.env.VITE_API_URL }),
});
```

백엔드 경로가 기본값(`/auth/login`, `/auth/refresh`, `/auth/logout`)과 다르면 다른 것만 넘긴다.

```ts
cookieSession({ baseUrl, paths: { refresh: '/auth/refresh-token' } });
```

chatbot 처럼 code 를 백엔드가 교환하고, refresh token 을 body 로 주고받는 서비스라면 아래와 같다.

```ts
createAccountClient({
  // ...
  scopes: ['openid', 'name'],
  exchange: 'backend',
  session: bodySession({
    baseUrl: import.meta.env.VITE_API_URL,
    paths: {
      login: '/v1/auth/admin/login',
      refresh: '/v1/auth/admin/refresh',
      logout: '/v1/auth/admin/logout',
    },
  }),
});
```

요청과 응답의 모양까지 다르면 `SessionAdapter`(`login`, `refresh`, `logout`)를 직접 구현해 넘긴다.

### 2. Provider 와 라우트

```tsx
<AccountProvider client={account}>
  <RouterProvider router={router} />
</AccountProvider>
```

redirect URI 경로에 `AccountCallback` 을 둔다. StrictMode 에서도 code 를 한 번만 교환하고, 결과도 한 번만 알린다.

```tsx
function Callback() {
  const navigate = useNavigate();
  return (
    <AccountCallback
      fallback={<Loading />}
      onSuccess={({ returnTo }) => navigate({ to: returnTo ?? '/', replace: true })}
      onError={() => navigate({ to: '/', replace: true })}
    />
  );
}
```

로그인이 필요한 화면은 `RequireAuth` 로 감싼다. 로그인하지 않은 사용자는 IdP 로 보내고, 로그인한 뒤 원래 페이지로 돌아온다.
로그인 화면을 따로 두는 앱은 `redirect={false}` 를 넘기고 `fallback` 에 로그인 화면을 둔다.

```tsx
<RequireAuth fallback={<Loading />}>
  <MyPage />
</RequireAuth>
```

### 3. 상태와 동작

```tsx
const { status, error, login, logout, retryLogin, fetch } = useAccount();
```

- `status`: `loading`, `authenticated`, `unauthenticated` 중 하나다.
- `error.code` 로 실패 이유를 나눈다. 예를 들어 사용자가 IdP 화면에서 취소하면 `user_cancelled` 다.
- 서비스 백엔드가 로그인을 거절하면 `session_rejected` 다. 거절 응답 body 는 `error.details` 에 있다.
  house-moving-out 처럼 약관 동의를 받아야 하면 `retryLogin(body)` 로 같은 IdP 토큰과 동의 내용을 다시 보낸다.

### 4. API 요청

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

- access token 은 메모리에만 둔다. 새로 고침하면 `session.refresh()` 로 복구한다.
- 진행 중인 로그인 정보(PKCE verifier, state)는 state 별 키로 `sessionStorage` 에 둔다. 여러 탭에서 동시에 로그인해도 서로 덮어쓰지 않는다.
- 로그아웃해도 IdP 로그인 세션은 남는다. 그래서 로그아웃 직후 첫 로그인에서는 `prompt=login` 으로 로그인 화면을 띄워 계정을 바꿀 수 있게 한다.
