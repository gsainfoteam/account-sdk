# @gsainfoteam/account-web

인포팀 계정(IdP) 브라우저 클라이언트. 특정 프레임워크에 의존하지 않는다. React 앱이라면 [`@gsainfoteam/account-react`](../react) 를 쓴다.
설치 방법(GitHub Packages 인증)도 그 README 에 있다.

```bash
pnpm add @gsainfoteam/account-web zod
```

```ts
import { createAccountClient } from '@gsainfoteam/account-web';

// 라우터보다 먼저 만든다. callback 으로 열린 페이지면 여기서 주소를 로그인 전 위치로 바꾼다
const account = createAccountClient({ issuer: 'production', clientId, api: apiUrl });

await account.ready(); // callback 이면 백엔드 로그인을 마치고, 아니면 세션을 복구한다
account.store.subscribe((state) => render(state));

// 로그인 버튼
await account.login({ returnTo: location.pathname });

// 라우터 guard
await account.requireAuth({ returnTo: nextUrl });
```

상태는 zustand 의 vanilla store(`account.store`)다. 다른 프레임워크에서도 구독할 수 있다.
API 요청에는 `account.fetch`, `@gsainfoteam/account-web/openapi-fetch`, `@gsainfoteam/account-web/axios` 중 하나를 쓴다.
