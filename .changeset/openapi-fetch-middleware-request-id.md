---
'@infoteam/account-web': patch
---

The openapi-fetch middleware now resends the body after a refresh even when a middleware registered after it replaces the request. It finds the copy it kept by openapi-fetch's request id and drops it once the response or error arrives.
