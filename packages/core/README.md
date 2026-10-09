# @gsainfoteam/account-core

다른 패키지들이 공유하는 코어. discovery 와 그 결함 보정, PKCE authorization URL, callback 검증, 토큰 요청, id_token 과 userinfo 검증, 에러 타입을 담는다.
보통은 직접 설치하지 않는다. [`account-react`](../react), [`account-web`](../web), [`account-nest`](../nest), [`account-server`](../server) 가 의존한다.

프로토콜 처리는 직접 구현하지 않는다. [oauth4webapi](https://github.com/panva/oauth4webapi) 와 [jose](https://github.com/panva/jose) 가 맡고, SDK 는 그 위에서
IdP 고유의 규칙만 맞춘다. 외부에서 들어오는 값은 zod 스키마로 검증하며, 타입도 그 스키마에서 나온다.
