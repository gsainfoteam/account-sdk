# @gsainfoteam/account-server

서비스 백엔드용 인포팀 계정(IdP) 클라이언트. 특정 프레임워크에 의존하지 않고 `fetch` 만 쓴다. NestJS 라면 [`@gsainfoteam/account-nest`](../nest) 를 쓴다.
설치 방법도 그 README 에 있다.

```ts
import { createAccountServer } from '@gsainfoteam/account-server';

const account = createAccountServer({
  issuer: 'production',
  clientId: process.env.ACCOUNT_CLIENT_ID!,
  clientSecret: process.env.ACCOUNT_CLIENT_SECRET,
});

const user = await account.getUserInfo(idpAccessToken);
```

| 메서드                             | 하는 일                                                  | secret    |
| ---------------------------------- | -------------------------------------------------------- | --------- |
| `getUserInfo(accessToken)`         | 프론트가 보낸 IdP access token 확인                      | 필요 없음 |
| `exchangeCode(params)`             | code 를 IdP 토큰으로 교환                                | 필요      |
| `loginWithCode(params)`            | 교환한 뒤 사용자 조회까지                                | 필요      |
| `getUserInfoBySub(sub)`            | client credentials 토큰으로 사용자 조회. 토큰은 캐시한다 | 필요      |
| `verifyIdToken(idToken)`           | 앱이 보낸 id_token 검증                                  | 필요 없음 |
| `revoke({ token, tokenTypeHint })` | 토큰 폐기                                                | 필요 없음 |
