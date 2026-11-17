---
'@infoteam/account-web': patch
---

Tabs of the same origin now send `/auth/refresh` one at a time through the Web Locks API. Before, two tabs could refresh with the same cookie, and a late `Set-Cookie` could put back a refresh token that another tab had already rotated, so the next refresh looked like token reuse and ended the session. Pages without Web Locks (non-secure contexts) still rely on the backend's grace window.
