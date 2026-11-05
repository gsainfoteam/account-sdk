# @infoteam/account-web

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
