# User API

User endpoints are declared in `shared/src/contracts/user.contracts.js` and mounted under `/api/v1`.

Authentication identity, Profile, Learning Profile, Resume, and Resume Version are separate records. Profile provisioning is eventually consistent: authentication emits `user.created`, and the user module consumes it idempotently.

Resume endpoints in Sprint 1 are read-only metadata. Uploads and version creation remain Sprint 3 scope.
