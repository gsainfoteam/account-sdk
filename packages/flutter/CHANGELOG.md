## 0.6.1

### Patch Changes

- 742a802: Fix `AccountInterceptor` hanging forever when the retry after a refresh failed, and a refresh that finished after `logout()` signing the user back in.

## 0.6.0

### Patch Changes

- 8aa03c8: Let services own their sessions.
  
  - web: add a `session` option so a backend with its own session format can plug in its calls. Give exactly one of `api` and `session`. `Session` and its related types are now exported, and `SessionTokens.expiresIn` is optional.
  - nest: **breaking** — remove the session module (`session` in `defineAccount`, `SessionGuard`, `OptionalSessionGuard`, `CurrentSession`, the session stores and the `./drizzle` entry). Services implement `/auth/login`, `/auth/refresh` and `/auth/logout` themselves with `loginWithCode`, following the session protocol in the README. See `examples/nest`.
  - core: remove `LOGIN_PROTOCOL_FIELDS`, which only the nest session module used.
  - flutter: only a 403 login failure carries a retry ticket, matching the web SDK and the session protocol. A new login also forgets the ticket of an earlier rejected login. A 403 without a ticket also forgets it, as on web.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

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
