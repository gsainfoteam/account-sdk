---
'@gsainfoteam/account-web': minor
'@gsainfoteam/account-nest': minor
'@gsainfoteam/account-core': minor
'gsainfoteam_account': patch
---

Let services own their sessions.

- web: add a `session` option so a backend with its own session format can plug in its calls. Give exactly one of `api` and `session`. `Session` and its related types are now exported, and `SessionTokens.expiresIn` is optional.
- nest: **breaking** — remove the session module (`session` in `defineAccount`, `SessionGuard`, `OptionalSessionGuard`, `CurrentSession`, the session stores and the `./drizzle` entry). Services implement `/auth/login`, `/auth/refresh` and `/auth/logout` themselves with `loginWithCode`, following the session protocol in the README. See `examples/nest`.
- core: remove `LOGIN_PROTOCOL_FIELDS`, which only the nest session module used.
- flutter: only a 403 login failure carries a retry ticket, matching the web SDK and the session protocol. A new login also forgets the ticket of an earlier rejected login.
