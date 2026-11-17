# @infoteam/account-core

[![npm](https://img.shields.io/npm/v/%40infoteam%2Faccount-core)](https://www.npmjs.com/package/@infoteam/account-core)

인포팀 계정 SDK의 다른 패키지들이 공유하는 코어다.

> **보통은 직접 설치하지 않는다.** [`account-react`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/react), [`account-web`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/web), [`account-nest`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/nest), [`account-server`](https://github.com/gsainfoteam/account-sdk/tree/main/packages/server)가 이 패키지에 의존한다.

## 구성

- discovery와 그 결함 보정
- PKCE authorization URL
- callback 검증
- 토큰 요청
- id_token과 userinfo 검증
- 에러 타입

프로토콜 처리는 [oauth4webapi](https://github.com/panva/oauth4webapi)와 [jose](https://github.com/panva/jose)에 맡기고, 이 패키지는 IdP 고유의 규칙만 맞춘다.
