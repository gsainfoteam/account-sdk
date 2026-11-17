---
'@infoteam/account-web': minor
'@infoteam/account-react': minor
---

Deprecate `createAccountMiddleware`. Pass `account.fetch` as the `fetch` option of openapi-fetch (`createClient({ fetch: account.fetch })`) or hey-api instead. `account.fetch` retries inside the fetch call, so the client does not need to keep a copy of each request body. The middleware still works and will be removed in a later minor release. axios keeps using `attachAccount`.
