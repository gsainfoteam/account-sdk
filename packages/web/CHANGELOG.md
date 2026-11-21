# @infoteam/account-web

## 0.10.0

### Minor Changes

- 7d3f7dc: `account.loginReturnTo` and `useAccount().loginReturnTo` give the same-origin path that the login of this callback page returns to (the `returnTo` given to `login()` or `requireAuth()`, or the page where the login started), so a failed `app: 'mpa'` callback screen can pick its language, a back link and the `returnTo` of the next login without saving it before `login()`. It is `null` when the page is not a callback, the callback has no matching login progress (`state_mismatch`), or the login's `returnTo` was on another origin. In `app: 'spa'` it is the path the address was already moved to.

### Patch Changes

- @infoteam/account-core@0.10.0

## 0.9.0

### Minor Changes

- Seal `AccountError` into six kinds, like a Dart sealed class: `AccountError.Cancelled`, `Verification`, `Rejected`, `Expired`, `Network` and `Unknown`. The `AccountError` type is their union, so `switch (error.kind)` is checked for missing cases, and `instanceof AccountError.Rejected` narrows to the kind and works across duplicate copies of the module. `new AccountError(code, options)` builds the kind that matches the code. `reason` and `details` now live only on `AccountError.Rejected`; a non-rejection failure keeps the response body in `cause`. A rejected login carries the top-level `reason` of the 403 body, a backend failure body with a known `error` code keeps that code, and the new `invalid_ticket` code reports an expired ticket.
- `account.fetch` now sends the access token only to the `api` origin; add other backends with `tokenOrigins`. `createAccountClient` returns an inert client on the server, `app: 'mpa'` lets MPAs such as Astro reload the page the user was on after the callback (`'spa'` stays the default), and the callback path ignores a trailing slash. Blocked `sessionStorage` falls back to memory and makes `login()` reject instead of failing at the callback; blocked `localStorage` keeps the logout mark in `sessionStorage` and skips the silent login. `account.fetch` resolves relative URLs against `document.baseURI`, as the browser does, before choosing whether to send the token. A login still fetching scopes when an IdP logout starts no longer overrides the logout redirect. A failed `login()` stays in `error`, a `ReadableStream` given as `init.body` is not sent again after a refresh (a `Request` keeps its body through `clone()` and is), and the axios adapter no longer retries a persistent 401 forever.
- `AccountState.redirecting` is `true` while the client finishes a callback or silent login, or while the page is leaving for the IdP through `login()`, `requireAuth()` or `logout({ idp: true })`. It turns `false` again when the page comes back from the back-forward cache, or when a custom `redirect` throws. A page that left for a silent login or an `app: 'mpa'` callback then settles `ready()`, restoring the session once more after a silent login. `ready()` and `requireAuth()` still never settle while the page leaves, and `redirecting` shows why. `isHandlingRedirect()` now reads it.
- `createAccountClient<RetryBody>()` returns `AccountClient<RetryBody>`, whose `retryLogin(body)` takes `RetryBody`. The default stays `unknown`.

### Patch Changes

- `retryLogin()` rejects with the same `AccountError` it puts in `error`, instead of the raw error a custom `session` threw.
- Updated dependencies
  - @infoteam/account-core@0.9.0

## 0.8.0

### Minor Changes

- 0818598: **Breaking:** remove the openapi-fetch middleware (`createAccountMiddleware` and the `./openapi-fetch` entry). Pass `account.fetch` as the `fetch` option instead: `createClient({ fetch: account.fetch })` for openapi-fetch, or `fetch: account.fetch` in hey-api's `createClientConfig`. `account.fetch` retries inside the fetch call, so requests with a body are sent again after a refresh whatever other middleware does. `openapi-fetch` is no longer a peer dependency. axios keeps using `attachAccount`.

### Patch Changes

- fa0c4dc: Tabs of the same origin now send `/auth/refresh` one at a time through the Web Locks API. Before, two tabs could refresh with the same cookie, and a late `Set-Cookie` could put back a refresh token that another tab had already rotated, so the next refresh looked like token reuse and ended the session. Pages without Web Locks (non-secure contexts) still rely on the backend's grace window. `refresh()` called while the session is still being restored now waits for the restore and returns its token instead of sending a second refresh.
- @infoteam/account-core@0.8.0

## 0.7.1

### Patch Changes

- 3b78aff: The openapi-fetch middleware now resends the request body when it retries after a refresh. It used to throw `TypeError` for requests with a body, because openapi-fetch hands `onResponse` the request it already sent. After `logout()`, the client no longer uses a refresh cookie that a failed logout request left behind: a reload does not restore the session and a 401 does not trigger a refresh until the next login. A login or refresh that finishes after `logout()` is ignored, and `retryLogin()` then rejects with `unauthenticated` instead of resolving.
- @infoteam/account-core@0.7.1

## 0.7.0

### Patch Changes

- @infoteam/account-core@0.7.0

## 0.6.1

### Patch Changes

- @infoteam/account-core@0.6.1

## 0.6.0

### Minor Changes

- ab0d692: Publish to npmjs.com under the `@infoteam` scope. Packages were `@gsainfoteam/account-*` on GitHub Packages up to 0.5.1; replace the scope in imports and drop the GitHub Packages `.npmrc` entry if nothing else needs it. This release also removes the nest session module, so services that used it implement their own sessions as described in the session-adapter change.
- 8aa03c8: Let services own their sessions.

  - web: add a `session` option so a backend with its own session format can plug in its calls. Give exactly one of `api` and `session`. `Session` and its related types are now exported, and `SessionTokens.expiresIn` is optional.
  - nest: **breaking** — remove the session module (`session` in `defineAccount`, `SessionGuard`, `OptionalSessionGuard`, `CurrentSession`, the session stores and the `./drizzle` entry). Services implement `/auth/login`, `/auth/refresh` and `/auth/logout` themselves with `loginWithCode`, following the session protocol in the README. See `examples/nest`.
  - core: remove `LOGIN_PROTOCOL_FIELDS`, which only the nest session module used.
  - flutter: only a 403 login failure carries a retry ticket, matching the web SDK and the session protocol. A new login also forgets the ticket of an earlier rejected login. A 403 without a ticket also forgets it, as on web.

### Patch Changes

- Updated dependencies [ab0d692]
- Updated dependencies [8aa03c8]
  - @infoteam/account-core@0.6.0

## 0.5.1

### Patch Changes

- @gsainfoteam/account-core@0.5.1

## 0.5.0

### Patch Changes

- @gsainfoteam/account-core@0.5.0

## 0.4.0

### Minor Changes

- 9d0c404: Only a 403 from the service backend's login endpoint is reported as `session_rejected` now. A 5xx from login or refresh becomes `server_error` (account-nest sends 502 when the IdP fails). Any other failed login or refresh becomes `unknown`, except a refresh 401 or 403, which still ends the session without an error. The HTTP status stays in `error.status`. Code that treated every login failure as `session_rejected` should handle these codes too.

### Patch Changes

- Updated dependencies [2b79fe7]
  - @gsainfoteam/account-core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [bf59e4c]
  - @gsainfoteam/account-core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [b2621bd]
  - @gsainfoteam/account-core@0.2.0

## 0.1.0

### Minor Changes

- 8fcb60d: RP-Initiated Logout: `logout({ idp: true, returnTo })` on the web and `logout(idp: true)` in Flutter also end the IdP login session through the IdP's `end_session_endpoint`, returning through the already registered callback URL. Core normalizes `endSessionEndpoint` and adds `createLogoutUrl`. Without an advertised endpoint only the service session ends.
- 8fcb60d: `silentLogin: true` signs users in without a screen when they already have an IdP session: with no service session, the client goes to the IdP once per tab with `prompt=none` and comes back signed in, or signed out without an error. It never runs right after a logout.
- 8fcb60d: One login flow: the browser hands the callback code to the service backend, which exchanges it as a confidential client and reads the user from the id_token (`loginWithCode`, which now needs the nonce). `getUserInfo(accessToken)`, `exchangeCode` on the server, the browser exchange, `cookieSession`, `bodySession`, `handleCallback` and `<AccountCallback>` are removed.

  The web client takes `api` instead of `session`, always asks for `openid`, defaults `scopes` to the client's registered scopes and `redirectUri` to `/auth/callback`, and finishes the callback itself before the router reads the address. `requireAuth({ returnTo })` guards routes in any router; `<AccountProvider fallback>` covers the callback. `retryLogin` sends the backend's ticket instead of reusing a code. Core adds `userInfoFromIdToken`, `fetchClientRegistration` and the OIDC `login_required`, `consent_required` and `interaction_required` codes.

### Patch Changes

- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
- Updated dependencies [07ec9e7]
- Updated dependencies [8fcb60d]
- Updated dependencies [8fcb60d]
  - @gsainfoteam/account-core@0.1.0
