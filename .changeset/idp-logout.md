---
'@gsainfoteam/account-core': minor
'@gsainfoteam/account-web': minor
'@gsainfoteam/account-react': minor
'gsainfoteam_account': minor
---

RP-Initiated Logout: `logout({ idp: true, returnTo })` on the web and `logout(idp: true)` in Flutter also end the IdP login session through the IdP's `end_session_endpoint`, returning through the already registered callback URL. Core normalizes `endSessionEndpoint` and adds `createLogoutUrl`. Without an advertised endpoint only the service session ends.
