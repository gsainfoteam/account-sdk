---
'@gsainfoteam/account-testing': minor
---

New package: `createFakeIdp()` answers discovery, JWKS, token, userinfo and client registration in process, so services can test `/auth/login` through their guards without the staging IdP. `authorize({ clientId, user? })` returns the body the frontend SDK would send, and `fakeUser()` makes up a user with every claim (faker, Korean names) when none is given.
