---
'@gsainfoteam/account-contract': minor
'@gsainfoteam/account-core': minor
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

Type userinfo fields by the scopes a service declares. `createAccountServer` takes `requiredScopes`, and `getUserInfo` returns those fields as present after checking them at runtime (`missing_claims` otherwise). `getUserInfoBySub` follows `clientCredentialsScopes`. In Nest, `defineAccount` fixes the scopes and returns a module and an injectable service typed by them. The contract adds `UserClaims` and `SCOPE_CLAIMS`.
