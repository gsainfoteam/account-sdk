# @gsainfoteam/account-web

인포팀 계정(IdP) 로그인을 웹 앱에 붙인다. 특정 프레임워크에 의존하지 않는다. React 앱이라면 [`@gsainfoteam/account-react`](../react)를 쓴다.

## 설치

GitHub Packages에서 배포한다. 먼저 [설치 인증](../../README.md#설치-인증)을 설정한다.

```bash
pnpm add @gsainfoteam/account-web zod
```

## 사용

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

// API 요청. 401 이면 토큰을 갱신한 뒤 다시 보낸다
await account.fetch(`${apiUrl}/me`);
```

- 상태는 zustand의 vanilla store(`account.store`)에 있으므로, 어느 프레임워크에서든 구독할 수 있다.
- API 요청에는 `account.fetch`, `@gsainfoteam/account-web/openapi-fetch`, `@gsainfoteam/account-web/axios` 중 하나를 쓴다.
- 옵션, guard, 에러 코드, 로그아웃은 React와 같다. [`account-react` README](../react/README.md#사용)를 참고한다.
