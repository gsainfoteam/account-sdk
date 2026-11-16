---
"@infoteam/account-web": patch
---

The openapi-fetch middleware now resends the request body when it retries after a refresh. It used to throw `TypeError` for requests with a body, because openapi-fetch hands `onResponse` the request it already sent. After `logout()`, a reload no longer restores the session from a refresh cookie that the failed logout request left behind; the next login clears this.
