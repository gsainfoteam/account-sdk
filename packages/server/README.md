# @gsainfoteam/account-server

서비스 백엔드용 인포팀 계정(IdP) 클라이언트. 특정 프레임워크에 의존하지 않고 `fetch` 만 쓴다. NestJS 라면 [`@gsainfoteam/account-nest`](../nest) 를 쓴다.
설치 방법도 그 README 에 있다.

```ts
import { createAccountServer } from '@gsainfoteam/account-server';

const account = createAccountServer({
  issuer: 'production',
  clientId: process.env.ACCOUNT_CLIENT_ID!,
  clientSecret: process.env.ACCOUNT_CLIENT_SECRET,
  requiredScopes: ['name', 'email'], // client 에 필수로 등록한 scope
  clientCredentialsScopes: ['name'], // getUserInfoBySub 를 쓸 때만. client 에 등록한 scope 여야 한다
});

// 프론트가 callback 에서 받은 값을 그대로 넘긴다
const { user } = await account.loginWithCode({ code, codeVerifier, redirectUri, nonce });
user.name; // string
user.studentId; // string | undefined
```

- `loginWithCode` 는 code 를 confidential client 로 교환하고, 그 응답의 id_token 으로 사용자를 만든다. 그래서 프론트는 `openid` 를 요청해야 한다(웹과 Flutter SDK 는 항상 요청한다).
- 프론트가 보낸 IdP access token 으로는 로그인하지 않는다. account-be 의 access token 에는 대상 client 가 없어서, 누구나 등록할 수 있는 다른 client 의 토큰으로도 로그인이 되기 때문이다.
- `requiredScopes` 의 필드는 `loginWithCode` 결과에서 필수 타입이 된다. id_token 에 빠져 있으면 `missing_claims` 로 실패한다.
- `getUserInfoBySub` 결과는 `clientCredentialsScopes` 의 필드가 필수 타입이 된다.
- `requiredScopes` 에는 client 에 **필수로** 등록한 scope 만 넣는다. 선택 scope 를 넣으면 그 scope 를 거부한 사용자는 로그인하지 못한다.

| 메서드                             | 하는 일                                                  | secret    |
| ---------------------------------- | -------------------------------------------------------- | --------- |
| `loginWithCode(params)`            | code 를 교환하고 id_token 으로 사용자를 만든다           | 필요      |
| `getUserInfoBySub(sub)`            | client credentials 토큰으로 사용자 조회. 토큰은 캐시한다 | 필요      |
| `verifyIdToken(idToken)`           | 앱이 보낸 id_token 검증                                  | 필요 없음 |
| `revoke({ token, tokenTypeHint })` | 토큰 폐기                                                | 필요 없음 |
| `verifyRegistration()`             | IdP 등록이 `requiredScopes` 와 인증 방식에 맞는지 확인   | 필요 없음 |
