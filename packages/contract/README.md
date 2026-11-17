# @infoteam/account-contract

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-contract?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-contract)

인포팀 계정 IdP([account-be](https://github.com/gsainfoteam/account-be), [account-fe](https://github.com/gsainfoteam/account-fe))와 SDK가 함께 쓰는 값을 모아 둔 패키지입니다. IdP가 받는 scope, scope별 사용자 필드, account-fe의 거절 사유, OAuth 오류 코드와 prompt 같은 OAuth 상수를 담습니다.

| 사용처     | 사용 방식                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account-be | 이 패키지의 scope 목록으로 요청을 검증하고, 같은 목록을 [discovery 문서](https://api.account.gistory.me/.well-known/openid-configuration)에 싣습니다       |
| SDK (TS)   | 타입과 값을 이 패키지에서 import 합니다                                                                                                                    |
| SDK (Dart) | `pnpm contract:dart`가 이 패키지에서 Dart enum과 상수(`packages/flutter/lib/src/**/*.generated.dart`)를 생성합니다. CI는 생성한 파일이 최신인지 확인합니다 |

CommonJS로 빌드하는 account-be에서도 쓸 수 있도록 ESM과 CommonJS를 함께 배포합니다.

## 사용

```ts
import { CLIENT_SCOPES, SCOPE_CLAIMS, type ClientScope } from '@infoteam/account-contract';
```

## scope 변경 절차

1. [`src/scopes.ts`](https://github.com/gsainfoteam/account-sdk/blob/main/packages/contract/src/scopes.ts)를 고칩니다.
2. client scope를 더했다면 [`src/claims.ts`](https://github.com/gsainfoteam/account-sdk/blob/main/packages/contract/src/claims.ts)의 `SCOPE_CLAIMS`와 `UserClaims`에도 더합니다. 빠지면 타입 검사가 실패합니다.
3. core 테스트가 비교하는 discovery fixture(`packages/core/tests/fixtures/discovery.production.json`)의 `scopes_supported`도 맞춥니다.
4. `pnpm contract:dart`로 Dart 코드를 다시 생성합니다.
5. 이 패키지를 배포하고, account-be와 SDK가 새 버전을 받게 합니다.

live 테스트(`packages/server/tests/live/idp.test.ts`)가 운영과 스테이징 IdP의 discovery를 이 목록과 대조합니다. account-be 배포가 늦어 둘이 어긋나면 이 테스트가 실패합니다. CI에서는 돌지 않으므로 `mise run test:live`로 직접 실행합니다.
