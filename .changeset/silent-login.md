---
'@gsainfoteam/account-web': minor
'@gsainfoteam/account-react': minor
---

`silentLogin: true` signs users in without a screen when they already have an IdP session: with no service session, the client goes to the IdP once per tab with `prompt=none` and comes back signed in, or signed out without an error. It never runs right after a logout.
