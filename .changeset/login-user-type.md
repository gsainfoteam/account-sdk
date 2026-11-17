---
"@infoteam/account-server": minor
"@infoteam/account-nest": minor
---

Add the `LoginUser<Account>` and `LookupUser<Account>` types, which read the user types of `loginWithCode` and `getUserInfoBySub` from an account server or a `defineAccount` service, so services no longer repeat their scopes in `UserInfo<...>`.
