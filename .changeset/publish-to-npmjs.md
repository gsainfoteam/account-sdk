---
'@gsainfoteam/account-core': patch
---

The npm packages are now published to the public npm registry (npmjs.com) instead of GitHub Packages, so installing them needs no `.npmrc` or token. Remove the `@gsainfoteam:registry=https://npm.pkg.github.com` line and its `_authToken` line from your `.npmrc`.
