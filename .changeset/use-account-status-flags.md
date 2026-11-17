---
'@infoteam/account-react': minor
---

`useAccount()` also returns `isLoading` and `isAuthenticated`, so components can check the state without comparing `status` strings. `isAuthenticated` is also `false` while the session is being restored, so check `isLoading` first. `status` stays as it is.
