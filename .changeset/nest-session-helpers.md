---
"@infoteam/account-nest": minor
"@infoteam/account-server": minor
---

Add `toHttpException` to turn a login `AccountError` into the matching HTTP exception, the `LoginCodeBody` and `LoginBody` DTOs in `@infoteam/account-nest/dto`, and re-export the session protocol schemas and types (`SessionRejectedResponse`, `SESSION_REJECTED`, `LoginCodeBodySchema`, ...) from `@infoteam/account-server`.
