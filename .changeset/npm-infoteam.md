---
'@infoteam/account-contract': minor
'@infoteam/account-core': minor
'@infoteam/account-web': minor
'@infoteam/account-react': minor
'@infoteam/account-server': minor
'@infoteam/account-nest': minor
'@infoteam/account-testing': minor
---

Publish to npmjs.com under the `@infoteam` scope. Packages were `@gsainfoteam/account-*` on GitHub Packages up to 0.5.1; replace the scope in imports and drop the GitHub Packages `.npmrc` entry if nothing else needs it. This release also removes the nest session module, so services that used it implement their own sessions as described in the session-adapter change.
