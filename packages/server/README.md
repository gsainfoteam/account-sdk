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

const user = await account.getUserInfo(idpAccessToken);
user.name; // string
user.studentId; // string | undefined
```

- `requiredScopes` 의 필드는 `getUserInfo` 와 `loginWithCode` 결과에서 필수 타입이 된다. 응답에 빠져 있으면 `missing_claims` 로 실패한다.
- `getUserInfoBySub` 결과는 `clientCredentialsScopes` 의 필드가 필수 타입이 된다.
- `requiredScopes` 에는 client 에 **필수로** 등록한 scope 만 넣는다. 선택 scope 를 넣으면 그 scope 를 거부한 사용자는 로그인하지 못한다.

| 메서드                             | 하는 일                                                  | secret    |
| ---------------------------------- | -------------------------------------------------------- | --------- |
| `getUserInfo(accessToken)`         | 프론트가 보낸 IdP access token 확인                      | 필요 없음 |
| `exchangeCode(params)`             | code 를 IdP 토큰으로 교환                                | 필요      |
| `loginWithCode(params)`            | 교환한 뒤 사용자 조회까지                                | 필요      |
| `getUserInfoBySub(sub)`            | client credentials 토큰으로 사용자 조회. 토큰은 캐시한다 | 필요      |
| `verifyIdToken(idToken)`           | 앱이 보낸 id_token 검증                                  | 필요 없음 |
| `revoke({ token, tokenTypeHint })` | 토큰 폐기                                                | 필요 없음 |
