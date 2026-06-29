# Authentication API

Authentication endpoints are declared in `shared/src/contracts/auth.contracts.js` and mounted under `/api/v1`. The server and client consume this contract directly.

Access tokens are 15-minute RS256 JWTs in HTTP-only cookies. Refresh tokens are opaque, rotate on every refresh, and are stored only as hashes. Mutations require the double-submit CSRF token returned by `GET /auth/csrf`.

Supported provider adapters: Google. GitHub and Microsoft are reserved but not implemented.

Password recovery and verification endpoints return generic responses where account enumeration would otherwise be possible.
