---
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

`getUserInfoBySub()` no longer fails with `missing_claims` for a user who declined an optional scope. Only the fields of scopes in both `clientCredentialsScopes` and `requiredScopes` are typed as present; the rest may be `undefined`.
