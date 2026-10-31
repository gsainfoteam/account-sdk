# @gsainfoteam/account-core

## 0.3.0

### Minor Changes

- bf59e4c: OAuth 에러 코드, `prompt`, PKCE 방식, client 인증 방식, grant type, `amr`, IdP 화면 경로를 contract로 옮겼다. Dart의 `OAuthErrorCode`와 `AccountPrompt`는 이제 contract에서 생성한다.

  `profile`과 `picture`는 사용자에게 값이 없으면 `null` 대신 빠진다(OIDC Core 5.3.2). 타입은 `string | null`에서 `string | undefined`로 바뀌고, `requiredScopes`에 있어도 값이 없다는 이유로 `missing_claims`가 나지 않는다. `null`을 보내는 지금의 IdP 응답도 받아서 빠진 것으로 읽는다.

  Flutter에서 `code`도 `error`도 없는 콜백은 `AccountOAuthException('invalid_response')` 대신 `AccountMissingCodeException`으로 알린다.

### Patch Changes

- Updated dependencies [bf59e4c]
  - @gsainfoteam/account-contract@0.2.0

## 0.2.0

### Minor Changes

- b2621bd: Read IdP endpoints and the issuer exactly as discovery advertises them. `normalizeDiscovery()` no longer takes the URL the document was fetched from, and `AccountMetadata.issuers` is removed: callbacks, id_tokens and token responses must carry the discovery `issuer`, which account-be does from v2.5.0.

## 0.1.0

### Minor Changes

- 8fcb60d: Ship ESM only. The CommonJS builds did not help: CommonJS apps on Node 20.19+ `require()` the ESM build directly, and jest failed on the ESM-only jose and oauth4webapi either way. Jest users transform `@gsainfoteam`, `jose` and `oauth4webapi` as the account-nest README shows. `@gsainfoteam/account-contract` keeps its CommonJS build for account-be.
- 8fcb60d: RP-Initiated Logout: `logout({ idp: true, returnTo })` on the web and `logout(idp: true)` in Flutter also end the IdP login session through the IdP's `end_session_endpoint`, returning through the already registered callback URL. Core normalizes `endSessionEndpoint` and adds `createLogoutUrl`. Without an advertised endpoint only the service session ends.
- 07ec9e7: Type userinfo fields by the scopes a service declares. `createAccountServer` takes `requiredScopes`, and `getUserInfo` returns those fields as present after checking them at runtime (`missing_claims` otherwise). `getUserInfoBySub` follows `clientCredentialsScopes`. In Nest, `defineAccount` fixes the scopes and returns a module and an injectable service typed by them. The contract adds `UserClaims` and `SCOPE_CLAIMS`.
- 8fcb60d: Step-up basis: `loginWithCode(params, { maxAge, amr })` fails with the new `insufficient_authentication` code when the IdP login is too old or used another method, read from the id_token's `auth_time` and `amr`. Service sessions carry `auth_time` and `amr` from the login through every refresh.
- 8fcb60d: One login flow: the browser hands the callback code to the service backend, which exchanges it as a confidential client and reads the user from the id_token (`loginWithCode`, which now needs the nonce). `getUserInfo(accessToken)`, `exchangeCode` on the server, the browser exchange, `cookieSession`, `bodySession`, `handleCallback` and `<AccountCallback>` are removed.

  The web client takes `api` instead of `session`, always asks for `openid`, defaults `scopes` to the client's registered scopes and `redirectUri` to `/auth/callback`, and finishes the callback itself before the router reads the address. `requireAuth({ returnTo })` guards routes in any router; `<AccountProvider fallback>` covers the callback. `retryLogin` sends the backend's ticket instead of reusing a code. Core adds `userInfoFromIdToken`, `fetchClientRegistration` and the OIDC `login_required`, `consent_required` and `interaction_required` codes.

### Patch Changes

- Updated dependencies [07ec9e7]
  - @gsainfoteam/account-contract@0.1.0
