---
'@infoteam/account-server': patch
'@infoteam/account-nest': patch
---

Add `LoggedInUser<A>` and `LookedUpUser<A>`, the user types of `loginWithCode` and `getUserInfoBySub`, read from an `AccountServer` or a `defineAccount` service. Code that takes the user no longer writes the scopes again, as in `UserInfo<'name' | 'email'>`.
