---
'@infoteam/account-web': minor
'@infoteam/account-react': minor
---

**Breaking:** remove the openapi-fetch middleware (`createAccountMiddleware` and the `./openapi-fetch` entry). Pass `account.fetch` as the `fetch` option instead: `createClient({ fetch: account.fetch })` for openapi-fetch, or `fetch: account.fetch` in hey-api's `createClientConfig`. `account.fetch` retries inside the fetch call, so requests with a body are sent again after a refresh whatever other middleware does. `openapi-fetch` is no longer a peer dependency. axios keeps using `attachAccount`.
