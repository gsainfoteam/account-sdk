---
'@gsainfoteam/account-core': minor
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
---

Ship ESM only. The CommonJS builds did not help: CommonJS apps on Node 20.19+ `require()` the ESM build directly, and jest failed on the ESM-only jose and oauth4webapi either way. Jest users transform `@gsainfoteam`, `jose` and `oauth4webapi` as the account-nest README shows. `@gsainfoteam/account-contract` keeps its CommonJS build for account-be.
