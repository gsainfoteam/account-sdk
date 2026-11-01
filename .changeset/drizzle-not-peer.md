---
'@gsainfoteam/account-nest': patch
---

`drizzle-orm`을 peer dependency에서 뺐다. GitHub Packages가 `peerDependenciesMeta`를 레지스트리 메타데이터에 싣지 않아서, npm 7 이상이 Redis나 Prisma만 쓰는 서비스에도 `drizzle-orm`을 설치했다. `@gsainfoteam/account-nest/drizzle`을 쓰려면 지금처럼 서비스에 `drizzle-orm`(^0.45)을 직접 설치한다.
