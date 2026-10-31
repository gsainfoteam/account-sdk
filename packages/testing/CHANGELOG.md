# @gsainfoteam/account-testing

## 0.3.0

### Minor Changes

- bf59e4c: Move OAuth error codes, `prompt`, the PKCE method, client authentication methods, grant types, `amr` and IdP page paths into the contract. The Dart `OAuthErrorCode` and `AccountPrompt` are now generated from it.

  `profile` and `picture` are now absent instead of `null` when the user has no value (OIDC Core 5.3.2). Their type changes from `string | null` to `string | undefined`, and a missing value no longer fails `missing_claims` even when the scope is in `requiredScopes`. IdP responses that still send `null` are accepted and read as absent.

  On Flutter, a callback with neither `code` nor `error` now throws `AccountMissingCodeException` instead of `AccountOAuthException('invalid_response')`.

### Patch Changes

- Updated dependencies [bf59e4c]
  - @gsainfoteam/account-contract@0.2.0

## 0.2.0

### Minor Changes

- bd0d1d5: Add `@gsainfoteam/account-testing`, an in-memory fake of the account IdP for service e2e tests. Its discovery and id_token `iss` use the login page host like the real IdP.
