# @gsainfoteam/account-server

서비스 백엔드용 인포팀 계정(IdP) 클라이언트. 특정 프레임워크에 의존하지 않고 `fetch`만 쓴다. NestJS라면 [`@gsainfoteam/account-nest`](../nest)를 쓴다.

이 패키지는 IdP로 사용자를 확인하는 데까지만 맡는다. [서비스 세션](../../README.md#서비스-세션)(토큰 발급, 갱신, 로그아웃)은 직접 구현해야 하므로,
가능하면 NestJS 세션 모듈을 쓴다.

## 설치

GitHub Packages에서 배포한다. 먼저 [설치 인증](../../README.md#설치-인증)을 설정한다.

```bash
pnpm add @gsainfoteam/account-server zod
```

## 사용

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

- `loginWithCode`는 code를 confidential client로서 교환하고, 응답에 담긴 id_token으로 사용자를 만든다. 그래서 프론트는 `openid`를 요청해야 한다(웹과 Flutter SDK는 항상 요청한다).
- `requiredScopes`의 필드는 `loginWithCode` 결과에서, `clientCredentialsScopes`의 필드는 `getUserInfoBySub` 결과에서 필수 타입이 된다. id_token에 필드가 빠져 있으면 `missing_claims`로 실패한다.
- `requiredScopes`에는 client에 **필수로** 등록한 scope만 넣는다. 선택 scope를 넣으면 그 scope를 거부한 사용자는 로그인하지 못한다.
- `loginWithCode(params, { maxAge: 300, amr: ['hwk'] })`처럼 로그인 조건을 요구할 수 있다. IdP에 로그인한 지 5분이 넘었거나 패스키로 로그인하지 않았으면
  `insufficient_authentication`으로 실패한다. account에 2FA가 생기면 같은 자리에서 확인한다.

## 메서드

| 메서드                             | 기능                                                                                                         | secret    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| `loginWithCode(params)`            | code를 교환하고 id_token으로 사용자를 만든다                                                                 | 필요      |
| `getUserInfoBySub(sub)`            | client credentials 토큰으로 사용자 조회. 이 client에 동의하지 않았거나 없는 사용자면 `null`. 토큰은 캐시한다 | 필요      |
| `verifyIdToken(idToken)`           | 앱이 보낸 id_token 검증                                                                                      | 필요 없음 |
| `revoke({ token, tokenTypeHint })` | 토큰 폐기                                                                                                    | 필요 없음 |
| `verifyRegistration()`             | IdP 등록 정보와 `requiredScopes`, 인증 방식 대조                                                             | 필요 없음 |

실패하면 `AccountError`를 던지므로 `code`로 경우를 나눈다.
