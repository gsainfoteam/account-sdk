---
'@infoteam/account-web': minor
'@infoteam/account-react': minor
---

`account.callbackReturnTo` and `useAccount().callbackReturnTo` give the same-origin path where the login of this callback page started, so a failed `app: 'mpa'` callback screen can pick its language, a back link and the `returnTo` of the next login without saving it before `login()`. It is `null` when the page is not a callback, the callback has no matching login progress (`state_mismatch`), or the login's `returnTo` was on another origin. In `app: 'spa'` it is the path the address was already moved to.
