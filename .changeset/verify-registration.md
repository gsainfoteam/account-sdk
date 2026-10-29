---
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

`verifyRegistration()` reads the client's public registration and fails with `invalid_client` when `requiredScopes` are not all required scopes, `clientCredentialsScopes` are not registered, or a confidential client does not use `client_secret_post`. The Nest module runs it on bootstrap and refuses to start on a mismatch (`verifyRegistration: 'warn' | 'off'` to relax it); an unreachable IdP only logs.
