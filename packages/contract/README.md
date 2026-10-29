# @gsainfoteam/account-contract

인포팀 계정 IdP(account-be, account-fe)와 SDK가 함께 쓰는 값. IdP가 받는 scope와 account-fe의 거절 사유를 담는다.

- account-be는 이 패키지의 scope 목록으로 요청을 검증하고, 같은 목록을 discovery에 싣는다.
- SDK의 TypeScript 타입은 이 패키지에서 import 하고, Dart enum은 `pnpm contract:dart`가 이 패키지에서 생성한다.

CommonJS로 빌드하는 account-be에서도 쓸 수 있도록 ESM과 CommonJS를 함께 배포한다.

```ts
import { CLIENT_SCOPES, type Scope } from '@gsainfoteam/account-contract';
```

## scope 변경 절차

1. `src/scopes.ts`를 고친다.
2. `pnpm contract:dart`로 Dart enum을 다시 생성한다.
3. 이 패키지를 배포하고, account-be와 SDK가 새 버전을 받게 한다.

SDK의 live 테스트가 실제 IdP의 discovery와 이 목록을 대조한다. account-be 배포가 늦어 둘이 어긋나면 이 테스트가 실패한다.
