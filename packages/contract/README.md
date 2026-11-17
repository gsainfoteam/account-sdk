# @infoteam/account-contract

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-contract)](https://www.npmjs.com/package/@infoteam/account-contract)

인포팀 계정 IdP(account-be, account-fe)와 SDK가 함께 쓰는 값을 모아 둔 패키지입니다. IdP가 받는 scope와 account-fe의 거절 사유를 담습니다.

| 사용처     | 사용 방식                                                                    |
| ---------- | ---------------------------------------------------------------------------- |
| account-be | 이 패키지의 scope 목록으로 요청을 검증하고, 같은 목록을 discovery에 싣습니다 |
| SDK (TS)   | TypeScript 타입을 이 패키지에서 import 합니다                                |
| SDK (Dart) | `pnpm contract:dart`가 이 패키지에서 Dart enum을 생성합니다                  |

CommonJS로 빌드하는 account-be에서도 쓸 수 있도록 ESM과 CommonJS를 함께 배포합니다.

## 사용

```ts
import { CLIENT_SCOPES, type Scope } from '@infoteam/account-contract';
```

## scope 변경 절차

1. `src/scopes.ts`를 고칩니다.
2. `pnpm contract:dart`로 Dart enum을 다시 생성합니다.
3. 이 패키지를 배포하고, account-be와 SDK가 새 버전을 받게 합니다.

SDK의 live 테스트가 실제 IdP의 discovery와 이 목록을 대조합니다. account-be 배포가 늦어 둘이 어긋나면 이 테스트가 실패합니다.
