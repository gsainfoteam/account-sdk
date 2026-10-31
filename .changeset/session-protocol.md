---
'@gsainfoteam/account-core': patch
---

Export the session wire format shared by account-web and account-nest (`LoginRequestBody`, `LoginCodeBodySchema`, `LoginTicketBodySchema`, `SessionTokensResponseSchema`, `SessionTransport`, `SESSION_REJECTED`), so the two sides cannot drift apart. Behavior is unchanged.
