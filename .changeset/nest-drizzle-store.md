---
'@gsainfoteam/account-nest': minor
---

`@gsainfoteam/account-nest/drizzle`에서 Drizzle(PostgreSQL)용 `accountSession` 테이블과 `drizzleSessionStore(db)`를 제공한다. README에 있던 구현을 패키지로 옮긴 것이다. `drizzle-orm`은 선택 peer dependency라서 Prisma나 Redis를 쓰는 서비스는 설치하지 않아도 된다. `{ checkActive: true }`를 넘기면 `isActive`가 켜져서 로그아웃한 세션의 access token을 바로 막는다.
