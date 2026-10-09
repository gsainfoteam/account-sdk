# @gsainfoteam/account-web

인포팀 계정(IdP) 브라우저 클라이언트. 특정 프레임워크에 의존하지 않는다. React 앱이라면 [`@gsainfoteam/account-react`](../react) 를 쓴다.
설치 방법(GitHub Packages 인증)도 그 README 에 있다.

```bash
pnpm add @gsainfoteam/account-web zod
```

```ts
import { cookieSession, createAccountClient } from '@gsainfoteam/account-web';

const account = createAccountClient({
  issuer: 'production',
  clientId,
  redirectUri: '/auth/callback',
  scopes: ['name', 'email'],
  exchange: 'browser',
  session: cookieSession({ baseUrl: apiUrl }),
});

await account.ready();
account.store.subscribe((state) => render(state));

// 로그인 버튼
await account.signIn({ returnTo: location.pathname });

// redirect URI 페이지
const { returnTo } = await account.handleCallback();
```

상태는 zustand 의 vanilla store(`account.store`)다. 다른 프레임워크에서도 구독할 수 있다.
API 요청에는 `account.fetch`, `@gsainfoteam/account-web/openapi-fetch`, `@gsainfoteam/account-web/axios` 중 하나를 쓴다.
