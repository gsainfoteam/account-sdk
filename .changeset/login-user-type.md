---
"@infoteam/account-server": minor
"@infoteam/account-nest": minor
---

Add the `LoginUser<Account>` type, which reads the user type of `loginWithCode` from an account server or a `defineAccount` service, so services no longer repeat their `requiredScopes` in `UserInfo<...>`.
