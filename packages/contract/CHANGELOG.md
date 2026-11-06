# @infoteam/account-contract

## 0.3.0

### Minor Changes

- ab0d692: Publish to npmjs.com under the `@infoteam` scope. Packages were `@gsainfoteam/account-*` on GitHub Packages up to 0.5.1; replace the scope in imports and drop the GitHub Packages `.npmrc` entry if nothing else needs it. This release also removes the nest session module, so services that used it implement their own sessions as described in the session-adapter change.

## 0.2.0

### Minor Changes

- bf59e4c: Move OAuth error codes, `prompt`, the PKCE method, client authentication methods, grant types, `amr` and IdP page paths into the contract. The Dart `OAuthErrorCode` and `AccountPrompt` are now generated from it.

  `profile` and `picture` are now absent instead of `null` when the user has no value (OIDC Core 5.3.2). Their type changes from `string | null` to `string | undefined`, and a missing value no longer fails `missing_claims` even when the scope is in `requiredScopes`. IdP responses that still send `null` are accepted and read as absent.

  On Flutter, a callback with neither `code` nor `error` now throws `AccountMissingCodeException` instead of `AccountOAuthException('invalid_response')`.

## 0.1.0

### Minor Changes

- 07ec9e7: Type userinfo fields by the scopes a service declares. `createAccountServer` takes `requiredScopes`, and `getUserInfo` returns those fields as present after checking them at runtime (`missing_claims` otherwise). `getUserInfoBySub` follows `clientCredentialsScopes`. In Nest, `defineAccount` fixes the scopes and returns a module and an injectable service typed by them. The contract adds `UserClaims` and `SCOPE_CLAIMS`.
