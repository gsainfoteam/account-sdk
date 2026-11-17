# @infoteam/account-core

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-core?color=CB3837)](https://www.npmjs.com/package/@infoteam/account-core)

인포팀 계정 SDK의 다른 패키지들이 공유하는 코어입니다.

> **보통은 직접 설치하지 않습니다.** [`account-react`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react), [`account-web`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web), [`account-nest`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest), [`account-server`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server)가 이 패키지에 의존합니다.

## 구성

- [discovery 문서](https://api.account.gistory.me/.well-known/openid-configuration) 조회와 검증([`normalizeDiscovery`](https://github.com/gsainfoteam/account-sdk/blob/main/packages/core/src/discovery/normalize-discovery.ts))
- client 등록 정보 조회
- PKCE authorization URL과 로그아웃 URL
- callback 검증
- 토큰 요청(code 교환, client credentials, 폐기)
- id_token과 userinfo 검증
- 세션 프로토콜의 요청과 응답 스키마
- 에러 타입

프로토콜 처리는 [oauth4webapi](https://github.com/panva/oauth4webapi)와 [jose](https://github.com/panva/jose)에 맡기고, 이 패키지는 IdP 고유의 규칙만 맞춥니다. [zod](https://zod.dev)(4.x)는 peerDependency입니다.
