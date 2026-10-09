# @gsainfoteam/account-contract

인포팀 계정 IdP(account-be, account-fe)와 SDK 가 함께 쓰는 값. IdP 가 받는 scope 와 account-fe 의 거절 사유가 들어 있다.

이 패키지가 그 값들의 유일한 출처다.

- account-be 는 여기의 scope 목록으로 요청을 검증하고 discovery 에 광고한다.
- SDK 의 TypeScript 타입은 여기서 import 하고, Dart enum 은 `pnpm contract:dart` 가 여기서 생성한다.

런타임 의존성이 없고 상수만 담는다. ESM 과 CommonJS 를 함께 배포하므로 CommonJS 로 빌드하는 account-be 에서도 쓸 수 있다.

```ts
import { CLIENT_SCOPES, type Scope } from '@gsainfoteam/account-contract';
```

## scope 를 추가하거나 뺄 때

1. `src/scopes.ts` 를 고친다.
2. `pnpm contract:dart` 로 Dart enum 을 다시 생성한다.
3. 이 패키지를 배포하고, account-be 와 SDK 가 새 버전을 받게 한다.

SDK 는 실제 IdP 의 discovery 와 이 목록을 테스트로 대조한다. account-be 배포가 늦어 둘이 어긋나면 그 테스트가 실패한다.
