# @gsainfoteam/account-react

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
