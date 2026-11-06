# @infoteam/account-web

인포팀 계정(IdP) 로그인을 웹 앱에 붙인다. 특정 프레임워크에 의존하지 않는다. React 앱이라면 [`@infoteam/account-react`](../react)를 쓴다.

## 설치

```bash
pnpm add @infoteam/account-web zod
```

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

- 상태는 zustand의 vanilla store(`account.store`)에 있으므로, 어느 프레임워크에서든 구독할 수 있다.
- API 요청에는 `account.fetch`, `@infoteam/account-web/openapi-fetch`, `@infoteam/account-web/axios` 중 하나를 쓴다.
- 옵션, guard, 에러 코드, 로그아웃은 React와 같다. [`account-react` README](../react/README.md#사용)를 참고한다.

## 백엔드 형식이 다를 때

`api`는 백엔드가 [세션 프로토콜](../../README.md#세션-프로토콜)을 구현했다고 가정한다. 형식이 다르면 `api` 대신 `session`에 백엔드 호출을 직접
구현해서 넘긴다. 둘 중 하나만 줄 수 있다.

```ts
import { createAccountClient, type Session } from '@infoteam/account-web';

const session: Session = {
  async start(credential) {
    if ('ticket' in credential) throw new Error('this backend does not reject logins');
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
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
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

- `start`는 callback으로 받은 code, PKCE verifier, `redirectUri`, `nonce`를 받는다. 백엔드는 code를 교환할 때 이 `redirectUri`를 그대로 쓰고, id_token의 `nonce`를 확인해야 한다.
- 로그인 전에 추가 입력을 받으려면 `start`가 `{ rejected: { error, ticket } }`를 돌려준다. 그러면 `retryLogin(body)`가 `start({ ticket }, body)`로 다시 부른다.
- `refresh`는 세션이 없으면 `null`을 돌려준다. 다른 실패는 throw 한다.
