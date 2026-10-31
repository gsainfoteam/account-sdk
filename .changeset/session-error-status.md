---
'@gsainfoteam/account-web': minor
---

Only a 403 from the service backend's login endpoint is reported as `session_rejected` now. A 5xx from login or refresh becomes `server_error` (account-nest sends 502 when the IdP fails), and any other failure becomes `unknown`. The HTTP status stays in `error.status`. Code that treated every login failure as `session_rejected` should handle these codes too.
