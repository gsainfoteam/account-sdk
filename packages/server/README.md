# @infoteam/account-server

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-server?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-server)

서비스 백엔드용 인포팀 계정(IdP) 클라이언트입니다. 특정 프레임워크에 의존하지 않고 `fetch`만 씁니다. NestJS라면 [`@infoteam/account-nest`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest)를 씁니다.

> **이 패키지는 IdP로 사용자를 확인하는 데까지만 맡습니다.** [서비스 세션](https://github.com/gsainfoteam/account-sdk#서비스-세션)(토큰 발급, 갱신, 로그아웃)은 서비스가 [세션 프로토콜](https://github.com/gsainfoteam/account-sdk#세션-프로토콜)에 맞춰 직접 구현합니다.

## 설치

```bash
pnpm add @infoteam/account-server zod
```

ESM으로만 배포하고 Node 20.19 이상이 필요합니다. jest를 쓰면 [`account-nest`의 jest 설정](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest#jest-설정)을 똑같이 적용합니다.

## 사용

```ts
import { createAccountServer } from '@infoteam/account-server';

const account = createAccountServer({
  issuer: 'production',
  clientId: process.env.ACCOUNT_CLIENT_ID!,
  clientSecret: process.env.ACCOUNT_CLIENT_SECRET,
  requiredScopes: ['name', 'email'], // client 에 필수로 등록한 scope
  clientCredentialsScopes: ['name'], // getUserInfoBySub 를 쓸 때만. client 에 등록한 scope 여야 한다
  // fetch: 생략하면 전역 fetch 를 쓴다
});

// 프론트가 callback 에서 받은 값을 그대로 넘긴다
const { user } = await account.loginWithCode({ code, codeVerifier, redirectUri, nonce, iss });
user.name; // string
user.studentId; // string | undefined
```

옵션이 비어 있거나 틀리면 `createAccountServer`가 바로 `invalid_request`를 던집니다. `iss`는 callback이 준 값이고 생략할 수 있습니다. 값을 주면 discovery 문서의 issuer와 비교해서, 다르면 `issuer_mismatch`로 실패합니다.

`loginWithCode`는 code를 confidential client로서 교환하고, 응답에 담긴 id_token으로 사용자를 만듭니다. 그래서 프론트는 `openid`를 요청해야 합니다. 웹과 Flutter SDK는 항상 요청합니다.

### scope와 필드 타입

- `requiredScopes`의 필드는 `loginWithCode` 결과에서 필수 타입이 됩니다. id_token에 필드가 빠져 있으면 `missing_claims`로 실패합니다. `profile`과 `picture`는 사용자가 비워 둘 수 있어서 예외입니다.
- `getUserInfoBySub` 결과에서는 `clientCredentialsScopes` 중 `requiredScopes`에도 있는 필드만 필수 타입입니다. 선택 scope는 사용자가 거절했을 수 있어서, 그 필드는 `undefined`일 수 있습니다. 필수 타입인 필드가 응답에 없으면 `missing_claims`로 실패합니다.

> **`requiredScopes`에는 client에 필수로 등록한 scope만 넣습니다.** 선택 scope를 넣으면 그 scope를 거부한 사용자는 로그인하지 못합니다.

### 로그인 조건

`loginWithCode(params, { maxAge: 300, amr: ['hwk'] })`처럼 로그인 조건을 요구할 수 있습니다. IdP에 로그인한 지 5분이 넘었거나 패스키로 로그인하지 않았으면 `insufficient_authentication`으로 실패합니다. `amr`은 나열한 값 중 하나만 있으면 통과합니다. id_token에 `auth_time`이 없는 오래된 세션은 `maxAge`를 주면 항상 실패합니다. account에 2FA가 생기면 같은 방식으로 확인합니다.

## 메서드

| 메서드                               | 기능                                                                                                                                                                 | secret    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `loginWithCode(params)`              | code를 교환하고 id_token으로 사용자를 만듭니다                                                                                                                       | 필요      |
| `getUserInfoBySub(sub)`              | client credentials 토큰으로 사용자 조회. 이 client에 동의하지 않았거나 없는 사용자면 `null`. 토큰은 캐시합니다. `clientCredentialsScopes`가 없으면 `invalid_request` | 필요      |
| `verifyIdToken(idToken, { nonce? })` | 앱이 보낸 id_token의 서명, `iss`, `aud`(`clientId`) 검증                                                                                                             | 필요 없음 |
| `revoke({ token, tokenTypeHint })`   | 토큰 폐기                                                                                                                                                            | 필요 없음 |
| `verifyRegistration()`               | IdP 등록 정보와 대조. `requiredScopes`는 필수 scope로, `clientCredentialsScopes`는 필수나 선택 scope로 등록됐는지 보고, secret이 있으면 인증 방식도 봅니다           | 필요 없음 |
| `metadata()`                         | IdP의 discovery 문서                                                                                                                                                 | 필요 없음 |

실패하면 `AccountError`를 던지므로 `code`로 경우를 나눕니다.
