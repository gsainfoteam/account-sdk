---
'@gsainfoteam/account-nest': minor
---

`defineAccount({ session })` adds a service session: `POST /auth/login`, `/auth/refresh` and `/auth/logout`, `SessionGuard`, `OptionalSessionGuard`, `@CurrentSession()` and `AccountService.verifySession`. `forRoot` takes `session: { secret, store, resolve }`; `resolve` turns the IdP user into the service subject and claims, and can throw `SessionRejected` to ask for more input, which the client sends back with a ticket. Access tokens are HS256 JWTs; refresh tokens rotate, are stored hashed, and a reused one ends its session. Refresh tokens travel in an httpOnly cookie for the web or in the body for apps. `prismaSessionStore` and `memorySessionStore` are included.
