## 0.3.0

### Minor Changes

- bf59e4c: Move OAuth error codes, `prompt`, the PKCE method, client authentication methods, grant types, `amr` and IdP page paths into the contract. The Dart `OAuthErrorCode` and `AccountPrompt` are now generated from it.

  `profile` and `picture` are now absent instead of `null` when the user has no value (OIDC Core 5.3.2). Their type changes from `string | null` to `string | undefined`, and a missing value no longer fails `missing_claims` even when the scope is in `requiredScopes`. IdP responses that still send `null` are accepted and read as absent.

  On Flutter, a callback with neither `code` nor `error` now throws `AccountMissingCodeException` instead of `AccountOAuthException('invalid_response')`.

## 0.2.0

### Minor Changes

- b2621bd: Read IdP endpoints and the issuer exactly as discovery advertises them. `normalizeDiscovery()` no longer takes the URL the document was fetched from, and `AccountMetadata.issuers` is removed: callbacks, id_tokens and token responses must carry the discovery `issuer`, which account-be does from v2.5.0.

## 0.1.0

### Minor Changes

- 8fcb60d: RP-Initiated Logout: `logout({ idp: true, returnTo })` on the web and `logout(idp: true)` in Flutter also end the IdP login session through the IdP's `end_session_endpoint`, returning through the already registered callback URL. Core normalizes `endSessionEndpoint` and adds `createLogoutUrl`. Without an advertised endpoint only the service session ends.
