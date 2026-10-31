# @gsainfoteam/account-contract

## 0.2.0

### Minor Changes

- bf59e4c: OAuth 에러 코드, `prompt`, PKCE 방식, client 인증 방식, grant type, `amr`, IdP 화면 경로를 contract로 옮겼다. Dart의 `OAuthErrorCode`와 `AccountPrompt`는 이제 contract에서 생성한다.

  `profile`과 `picture`는 사용자에게 값이 없으면 `null` 대신 빠진다(OIDC Core 5.3.2). 타입은 `string | null`에서 `string | undefined`로 바뀌고, `requiredScopes`에 있어도 값이 없다는 이유로 `missing_claims`가 나지 않는다. `null`을 보내는 지금의 IdP 응답도 받아서 빠진 것으로 읽는다.

  Flutter에서 `code`도 `error`도 없는 콜백은 `AccountOAuthException('invalid_response')` 대신 `AccountMissingCodeException`으로 알린다.

## 0.1.0

### Minor Changes

- 07ec9e7: Type userinfo fields by the scopes a service declares. `createAccountServer` takes `requiredScopes`, and `getUserInfo` returns those fields as present after checking them at runtime (`missing_claims` otherwise). `getUserInfoBySub` follows `clientCredentialsScopes`. In Nest, `defineAccount` fixes the scopes and returns a module and an injectable service typed by them. The contract adds `UserClaims` and `SCOPE_CLAIMS`.
