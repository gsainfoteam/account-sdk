# @gsainfoteam/account-nest

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
