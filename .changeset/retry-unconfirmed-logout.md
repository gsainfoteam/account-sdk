---
'@infoteam/account-web': patch
---

Send a logout the backend did not confirm again. When `POST /auth/logout` fails with a network error or a response other than `2xx`, `401` or `403`, `logout()` still signs the screen out and resolves, and the SDK now resends the request when the next client starts and when the browser comes back online, until the backend confirms it or the user logs in again. Before, the server session and the refresh cookie stayed until they expired. A custom `session.end()` that throws is called again with `null` the same way.
