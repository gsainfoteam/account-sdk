---
'@infoteam/account-web': minor
'@infoteam/account-react': minor
---

Deprecate `createAccountMiddleware`. Pass `account.fetch` as the `fetch` option of openapi-fetch (`createClient({ fetch: account.fetch })`) or hey-api instead. `account.fetch` retries inside the fetch call, so requests with a body are sent again after a refresh and the order of other middleware does not matter. The middleware still works and will be removed in a later minor release. axios keeps using `attachAccount`.
