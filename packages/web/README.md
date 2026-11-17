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

에러는 `AccountError`로 던져야 `error.code`로 경우를 나눌 수 있습니다. 다른 에러는 `unknown`이 됩니다.

로그인 전에 추가 입력을 받으려면 `start`가 `{ rejected: { error, ticket } }`를 돌려줍니다. `error`는 보통 `new AccountError('session_rejected', { details })`이고, `ticket`이 없으면 `canRetryLogin`이 `false`입니다. 그러면 `retryLogin(body)`가 `start({ ticket }, body)`를 호출합니다.
