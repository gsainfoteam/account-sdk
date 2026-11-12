---
"gsainfoteam_account": patch
---

Fix `AccountInterceptor` hanging forever when the retry after a refresh failed, and a refresh that finished after `logout()` signing the user back in.
