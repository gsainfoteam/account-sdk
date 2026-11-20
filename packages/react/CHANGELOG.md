# @infoteam/account-react

## 0.10.0

### Minor Changes

- 7d3f7dc: `account.loginStartedAt` and `useAccount().loginStartedAt` give the same-origin path where the login of this callback page started, so a failed `app: 'mpa'` callback screen can pick its language, a back link and the `returnTo` of the next login without saving it before `login()`. It is `null` when the page is not a callback, the callback has no matching login progress (`state_mismatch`), or the login's `returnTo` was on another origin. In `app: 'spa'` it is the path the address was already moved to.

### Patch Changes

- Updated dependencies [7d3f7dc]
  - @infoteam/account-web@0.10.0

## 0.9.0

### Minor Changes

- `RequireAuth`'s `fallback` accepts a function that receives `useAccount()`, so it can tell restoring apart from a failed login. Export `useAccountClient`.
- `AccountProvider` shows `fallback` while the store's `redirecting` is `true`, so it now also covers the page leaving for the IdP after `login()` or `logout({ idp: true })`, and shows the children again when the page comes back from the back-forward cache.
- `useAccount<RetryBody>()` and `useAccountClient<RetryBody>()` type the `retryLogin` body, and `AccountProvider` accepts a client made with `createAccountClient<RetryBody>()`. The default stays `unknown`.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @infoteam/account-web@0.9.0

## 0.8.0

### Minor Changes

- 0818598: **Breaking:** remove the openapi-fetch middleware (`createAccountMiddleware` and the `./openapi-fetch` entry). Pass `account.fetch` as the `fetch` option instead: `createClient({ fetch: account.fetch })` for openapi-fetch, or `fetch: account.fetch` in hey-api's `createClientConfig`. `account.fetch` retries inside the fetch call, so requests with a body are sent again after a refresh whatever other middleware does. `openapi-fetch` is no longer a peer dependency. axios keeps using `attachAccount`.
- 0818598: `useAccount()` also returns `isLoading` and `isAuthenticated`, so components can check the state without comparing `status` strings. `isAuthenticated` is also `false` while the session is being restored, so check `isLoading` first. `status` stays as it is.

### Patch Changes

- Updated dependencies [fa0c4dc]
- Updated dependencies [0818598]
  - @infoteam/account-web@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [3b78aff]
  - @infoteam/account-web@0.7.1

## 0.7.0

### Patch Changes

- @infoteam/account-web@0.7.0

## 0.6.1

### Patch Changes

- @infoteam/account-web@0.6.1

## 0.6.0

### Minor Changes

- ab0d692: Publish to npmjs.com under the `@infoteam` scope. Packages were `@gsainfoteam/account-*` on GitHub Packages up to 0.5.1; replace the scope in imports and drop the GitHub Packages `.npmrc` entry if nothing else needs it. This release also removes the nest session module, so services that used it implement their own sessions as described in the session-adapter change.

### Patch Changes

- Updated dependencies [ab0d692]
- Updated dependencies [8aa03c8]
  - @infoteam/account-web@0.6.0

## 0.5.1

### Patch Changes

- @gsainfoteam/account-web@0.5.1

## 0.5.0

### Patch Changes

- @gsainfoteam/account-web@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [9d0c404]
  - @gsainfoteam/account-web@0.4.0

## 0.3.0

### Patch Changes

- @gsainfoteam/account-web@0.3.0

## 0.2.0

### Patch Changes

- @gsainfoteam/account-web@0.2.0

## 0.1.0

### Minor Changes

- 8fcb60d: RP-Initiated Logout: `logout({ idp: true, returnTo })` on the web and `logout(idp: true)` in Flutter also end the IdP login session through the IdP's `end_session_endpoint`, returning through the already registered callback URL. Core normalizes `endSessionEndpoint` and adds `createLogoutUrl`. Without an advertised endpoint only the service session ends.
- 8fcb60d: `silentLogin: true` signs users in without a screen when they already have an IdP session: with no service session, the client goes to the IdP once per tab with `prompt=none` and comes back signed in, or signed out without an error. It never runs right after a logout.
- 8fcb60d: One login flow: the browser hands the callback code to the service backend, which exchanges it as a confidential client and reads the user from the id_token (`loginWithCode`, which now needs the nonce). `getUserInfo(accessToken)`, `exchangeCode` on the server, the browser exchange, `cookieSession`, `bodySession`, `handleCallback` and `<AccountCallback>` are removed.

  The web client takes `api` instead of `session`, always asks for `openid`, defaults `scopes` to the client's registered scopes and `redirectUri` to `/auth/callback`, and finishes the callback itself before the router reads the address. `requireAuth({ returnTo })` guards routes in any router; `<AccountProvider fallback>` covers the callback. `retryLogin` sends the backend's ticket instead of reusing a code. Core adds `userInfoFromIdToken`, `fetchClientRegistration` and the OIDC `login_required`, `consent_required` and `interaction_required` codes.

### Patch Changes

- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
  - @gsainfoteam/account-web@0.1.0
