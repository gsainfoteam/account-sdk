---
'@gsainfoteam/account-nest': patch
---

A refresh that races a logout no longer leaves a live refresh token behind. If the session is deleted between reading the old token and saving the new one, the refresh now fails and the new token is removed. Logout, reuse detection and `onLogin: 'replace'` now call `deleteSession`/`deleteSubject` twice, so a row saved while the first delete runs (SQL under READ COMMITTED, or the Redis store) is removed as well. A custom `SessionStore` must keep whatever index it uses to find a session's rows, so the second call can still find them.
