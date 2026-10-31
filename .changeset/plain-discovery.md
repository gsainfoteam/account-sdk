---
'@gsainfoteam/account-core': minor
'gsainfoteam_account': minor
---

Read IdP endpoints and the issuer exactly as discovery advertises them. `normalizeDiscovery()` no longer takes the URL the document was fetched from, and `AccountMetadata.issuers` is removed: callbacks, id_tokens and token responses must carry the discovery `issuer`, which account-be does from v2.5.0.
