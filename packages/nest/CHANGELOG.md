# @infoteam/account-nest

## 0.6.0

### Minor Changes

- ab0d692: Publish to npmjs.com under the `@infoteam` scope. Packages were `@gsainfoteam/account-*` on GitHub Packages up to 0.5.1; replace the scope in imports and drop the GitHub Packages `.npmrc` entry if nothing else needs it. This release also removes the nest session module, so services that used it implement their own sessions as described in the session-adapter change.
- 8aa03c8: Let services own their sessions.

  - web: add a `session` option so a backend with its own session format can plug in its calls. Give exactly one of `api` and `session`. `Session` and its related types are now exported, and `SessionTokens.expiresIn` is optional.
  - nest: **breaking** — remove the session module (`session` in `defineAccount`, `SessionGuard`, `OptionalSessionGuard`, `CurrentSession`, the session stores and the `./drizzle` entry). Services implement `/auth/login`, `/auth/refresh` and `/auth/logout` themselves with `loginWithCode`, following the session protocol in the README. See `examples/nest`.
  - core: remove `LOGIN_PROTOCOL_FIELDS`, which only the nest session module used.
  - flutter: only a 403 login failure carries a retry ticket, matching the web SDK and the session protocol. A new login also forgets the ticket of an earlier rejected login. A 403 without a ticket also forgets it, as on web.

### Patch Changes

- Updated dependencies [ab0d692]
- Updated dependencies [8aa03c8]
  - @infoteam/account-core@0.6.0
  - @infoteam/account-server@0.6.0

## 0.5.1

### Patch Changes

- 0cb622e: `drizzle-orm`을 peer dependency에서 뺐다. GitHub Packages가 `peerDependenciesMeta`를 레지스트리 메타데이터에 싣지 않아서, npm 7 이상이 Redis나 Prisma만 쓰는 서비스에도 `drizzle-orm`을 설치했다. `@gsainfoteam/account-nest/drizzle`을 쓰려면 지금처럼 서비스에 `drizzle-orm`(^0.45)을 직접 설치한다.
- @gsainfoteam/account-core@0.5.1
  - @gsainfoteam/account-server@0.5.1

## 0.5.0

### Minor Changes

- 273dd28: `@gsainfoteam/account-nest/drizzle`에서 Drizzle(PostgreSQL)용 `accountSession` 테이블과 `drizzleSessionStore(db)`를 제공한다. README에 있던 구현을 패키지로 옮긴 것이다. `drizzle-orm`은 선택 peer dependency라서 Prisma나 Redis를 쓰는 서비스는 설치하지 않아도 된다. `{ checkActive: true }`를 넘기면 `isActive`가 켜져서 로그아웃한 세션의 access token을 바로 막는다.

### Patch Changes

- b3a2889: A refresh that races a logout no longer leaves a live refresh token behind. If the session is deleted between reading the old token and saving the new one, the refresh now fails and the new token is removed. Logout, reuse detection and `onLogin: 'replace'` now call `deleteSession`/`deleteSubject` twice, so a row saved while the first delete runs (SQL under READ COMMITTED, or the Redis store) is removed as well. A custom `SessionStore` must keep whatever index it uses to find a session's rows, so the second call can still find them.
- @gsainfoteam/account-core@0.5.0
  - @gsainfoteam/account-server@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [2b79fe7]
  - @gsainfoteam/account-core@0.4.0
  - @gsainfoteam/account-server@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [bf59e4c]
  - @gsainfoteam/account-core@0.3.0
  - @gsainfoteam/account-server@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [b2621bd]
  - @gsainfoteam/account-core@0.2.0
  - @gsainfoteam/account-server@0.2.0

## 0.1.0

### Minor Changes

- 8fcb60d: Ship ESM only. The CommonJS builds did not help: CommonJS apps on Node 20.19+ `require()` the ESM build directly, and jest failed on the ESM-only jose and oauth4webapi either way. Jest users transform `@gsainfoteam`, `jose` and `oauth4webapi` as the account-nest README shows. `@gsainfoteam/account-contract` keeps its CommonJS build for account-be.
- 8078959: `getUserInfoBySub()` no longer fails with `missing_claims` for a user who declined an optional scope. Only the fields of scopes in both `clientCredentialsScopes` and `requiredScopes` are typed as present; the rest may be `undefined`.
- ed0ec41: `getUserInfoBySub()` resolves `null` for a user who has not consented to the client or does not exist, instead of failing with `unknown`. The IdP answers both alike, so the two cannot be told apart.
- 8fcb60d: `defineAccount({ session })` adds a service session: `POST /auth/login`, `/auth/refresh` and `/auth/logout`, `SessionGuard`, `OptionalSessionGuard`, `@CurrentSession()` and `AccountService.verifySession`. `forRoot` takes `session: { secret, store, resolve }`; `resolve` turns the IdP user into the service subject and claims, and can throw `SessionRejected` to ask for more input, which the client sends back with a ticket. Access tokens are HS256 JWTs; refresh tokens rotate, are stored hashed, and a reused one ends its session. Refresh tokens travel in an httpOnly cookie for the web or in the body for apps. `prismaSessionStore`, `redisSessionStore` (ioredis) and `memorySessionStore` are included.
- 07ec9e7: Type userinfo fields by the scopes a service declares. `createAccountServer` takes `requiredScopes`, and `getUserInfo` returns those fields as present after checking them at runtime (`missing_claims` otherwise). `getUserInfoBySub` follows `clientCredentialsScopes`. In Nest, `defineAccount` fixes the scopes and returns a module and an injectable service typed by them. The contract adds `UserClaims` and `SCOPE_CLAIMS`.
- 8fcb60d: Step-up basis: `loginWithCode(params, { maxAge, amr })` fails with the new `insufficient_authentication` code when the IdP login is too old or used another method, read from the id_token's `auth_time` and `amr`. Service sessions carry `auth_time` and `amr` from the login through every refresh.
- 8fcb60d: One login flow: the browser hands the callback code to the service backend, which exchanges it as a confidential client and reads the user from the id_token (`loginWithCode`, which now needs the nonce). `getUserInfo(accessToken)`, `exchangeCode` on the server, the browser exchange, `cookieSession`, `bodySession`, `handleCallback` and `<AccountCallback>` are removed.

  The web client takes `api` instead of `session`, always asks for `openid`, defaults `scopes` to the client's registered scopes and `redirectUri` to `/auth/callback`, and finishes the callback itself before the router reads the address. `requireAuth({ returnTo })` guards routes in any router; `<AccountProvider fallback>` covers the callback. `retryLogin` sends the backend's ticket instead of reusing a code. Core adds `userInfoFromIdToken`, `fetchClientRegistration` and the OIDC `login_required`, `consent_required` and `interaction_required` codes.

- 8fcb60d: `verifyRegistration()` reads the client's public registration and fails with `invalid_client` when `requiredScopes` are not all required scopes, `clientCredentialsScopes` are not registered, or a confidential client does not use `client_secret_post`. The Nest module runs it on bootstrap and refuses to start on a mismatch (`verifyRegistration: 'warn' | 'off'` to relax it); an unreachable IdP only logs.

### Patch Changes

- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
- Updated dependencies [8078959]
- Updated dependencies [ed0ec41]
- Updated dependencies [07ec9e7]
- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
  - @gsainfoteam/account-core@0.1.0
  - @gsainfoteam/account-server@0.1.0
