---
'@gsainfoteam/account-web': minor
---

Only a 403 from the service backend's login endpoint is reported as `session_rejected` now. A 5xx from login or refresh becomes `server_error` (account-nest sends 502 when the IdP fails). Any other failed login or refresh becomes `unknown`, except a refresh 401 or 403, which still ends the session without an error. The HTTP status stays in `error.status`. Code that treated every login failure as `session_rejected` should handle these codes too.
