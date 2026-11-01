---
'@gsainfoteam/account-nest': patch
---

A refresh that races a logout no longer leaves a live refresh token behind. If the session is deleted between reading the old token and saving the new one, the refresh now fails and the new token is revoked.
