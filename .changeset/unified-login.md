---
'@gsainfoteam/account-core': minor
'@gsainfoteam/account-server': minor
'@gsainfoteam/account-nest': minor
'@gsainfoteam/account-web': minor
'@gsainfoteam/account-react': minor
---

One login flow: the browser hands the callback code to the service backend, which exchanges it as a confidential client and reads the user from the id_token (`loginWithCode`, which now needs the nonce). `getUserInfo(accessToken)`, `exchangeCode` on the server, the browser exchange, `cookieSession`, `bodySession`, `handleCallback` and `<AccountCallback>` are removed.

The web client takes `api` instead of `session`, always asks for `openid`, defaults `scopes` to the client's registered scopes and `redirectUri` to `/auth/callback`, and finishes the callback itself before the router reads the address. `requireAuth({ returnTo })` guards routes in any router; `<AccountProvider fallback>` covers the callback. `retryLogin` sends the backend's ticket instead of reusing a code. Core adds `userInfoFromIdToken`, `fetchClientRegistration` and the OIDC `login_required`, `consent_required` and `interaction_required` codes.
