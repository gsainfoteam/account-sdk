# @infoteam/account-web

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-web?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-web)

인포팀 계정(IdP) 로그인을 웹 앱에 붙입니다. 특정 프레임워크에 의존하지 않습니다. React 앱이라면 [`@infoteam/account-react`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react)를 씁니다.

> **서비스 백엔드가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)을 구현해야 합니다.** 형식이 다른 백엔드는 [`session` 옵션](#session-옵션)으로 붙입니다.

## 설치

```bash
pnpm add @infoteam/account-web zod
```

[`axios`](https://github.com/axios/axios)는 `@infoteam/account-web/axios` 어댑터를 쓸 때만 설치합니다.

## 사용

```ts
import { createAccountClient } from '@infoteam/account-web';

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

- `ready()`는 reject 하지 않습니다. 실패는 `account.store.getState().error`에 남습니다. 자동 로그인(`silentLogin`)으로 IdP에 다녀오는 중이면 끝나지 않습니다.
- `account.isHandlingRedirect()`가 `true`이면 곧 IdP로 이동하거나 callback을 처리하는 중이므로, React의 `fallback`처럼 화면을 가려 둡니다.
- 상태는 [zustand](https://github.com/pmndrs/zustand)의 vanilla store(`account.store`)에 있으므로, 어느 프레임워크에서든 구독할 수 있습니다.
- API 요청에는 `account.fetch`를 씁니다. [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)나 [hey-api](https://heyapi.dev)처럼 `fetch` 옵션이 있는 클라이언트에도 `account.fetch`를 넘깁니다. `fetch` 옵션이 없는 [axios](https://github.com/axios/axios)에만 `@infoteam/account-web/axios`를 씁니다. [예시](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react#5-api-요청)를 참고합니다.
- 옵션, guard, 에러 코드, 로그아웃은 React와 같습니다. [`account-react` README](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react#사용)를 참고합니다.
- 브라우저가 `localStorage`나 `sessionStorage`를 막으면(사파리 개인 정보 보호 모드, 쿠키 차단 설정) 메모리에 둡니다. 이때는 로그인 진행 정보와 로그아웃 표시가 페이지를 떠나면 사라집니다.

## 서버 렌더링

`window`가 없는 곳(SSR, 빌드 시 prerender)에서 `createAccountClient`를 호출하면 브라우저 API를 건드리지 않는 client를 돌려줍니다. 그래서 client를 모듈 최상단에서 만들어도 서버에서 import 할 수 있습니다.

- 상태는 계속 `loading`이고 `ready()`는 바로 끝납니다. 서버가 그린 HTML에는 로그인 여부를 넣지 않고, 브라우저에서 hydrate 한 뒤 바뀝니다.
- `login`, `retryLogin`, `requireAuth`는 `invalid_request`로 reject 합니다. `logout`은 아무것도 하지 않고, `refresh`는 `null`을 돌려줍니다.
- `fetch`는 토큰을 붙이지 않은 일반 `fetch`입니다.

## MPA

[Astro](https://astro.build)처럼 페이지마다 문서를 새로 받는 앱은 `callbackNavigation: 'document'`를 줍니다.

```ts
export const account = createAccountClient({
  issuer: 'production',
  clientId,
  api: apiUrl,
  callbackNavigation: 'document',
});
```

- `redirectUri`(기본값 `/auth/callback`)에 페이지를 만들고 client를 import 합니다. 로그인을 마치면 client가 로그인 전 위치를 새로 불러오므로 이 페이지는 잠깐만 보입니다.
- 로그인이 실패하면 callback 페이지에 머뭅니다. 여기서 `error`를 보여 주고 다시 로그인할 버튼을 둡니다.
- 기본값 `'history'`는 주소만 바꾸므로 callback 페이지가 그대로 남습니다. SPA 라우터가 있을 때만 씁니다.
- 정적 호스팅이 `/auth/callback`을 `/auth/callback/`으로 바꿔도 같은 주소로 봅니다.

[`examples/astro`](https://github.com/gsainfoteam/account-sdk/tree/main/examples/astro)에 React island로 만든 예제가 있습니다.

## `account.fetch`가 토큰을 붙이는 주소

`account.fetch`는 `api`의 origin으로 가는 요청에만 access token을 붙이고, 401을 받으면 refresh 합니다. 다른 origin은 토큰 없이 그대로 보내서, 외부 API에 토큰이 새지 않게 합니다. `session` 옵션을 쓰면 페이지 origin이 기준입니다.

토큰을 받아야 하는 백엔드가 더 있으면 `tokenOrigins`에 origin을 더합니다.

```ts
createAccountClient({ ..., api: 'https://api.ziggle.gistory.me', tokenOrigins: ['https://upload.ziggle.gistory.me'] });
```

body가 `ReadableStream`인 요청은 한 번 보내면 다시 읽을 수 없으므로 401을 받아도 다시 보내지 않고 그 응답을 돌려줍니다.

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

로그인 전에 추가 입력을 받으려면 `start`가 `{ rejected: { error, ticket } }`를 돌려줍니다. `error`는 보통 `new AccountError('session_rejected', { reason, details })`이고, `ticket`이 없으면 `canRetryLogin`이 `false`입니다. 그러면 `retryLogin(body)`가 `start({ ticket }, body)`를 호출합니다.
