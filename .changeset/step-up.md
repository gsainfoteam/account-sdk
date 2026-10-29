---
'@gsainfoteam/account-core': minor
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

Step-up basis: `loginWithCode(params, { maxAge, amr })` fails with the new `insufficient_authentication` code when the IdP login is too old or used another method, read from the id_token's `auth_time` and `amr`. Service sessions carry `auth_time` and `amr` from the login through every refresh.
