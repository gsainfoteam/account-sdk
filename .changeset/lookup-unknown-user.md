---
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

`getUserInfoBySub()` resolves `null` for a user who has not consented to the client or does not exist, instead of failing with `unknown`. The IdP answers both alike, so the two cannot be told apart.
