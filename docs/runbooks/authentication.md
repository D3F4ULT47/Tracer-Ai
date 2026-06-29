# Authentication Runbook

## Required production configuration

- RS256 private/public keys encoded as base64
- token-hash and CSRF secrets of at least 32 characters
- Resend API key and verified sender
- application/client origins
- optional Google client ID, secret, and callback URL

## Incidents

- Suspected refresh-token reuse: confirm the family is revoked and inspect `security_audit_events`.
- Signing-key exposure: rotate the key ID and key pair, revoke all sessions, and deploy together.
- Email outage: registration data remains valid; users can resend verification after provider recovery.
- OAuth outage: disable the provider entry at configuration/rollout level; email authentication remains available.
- Outbox backlog: inspect pending/failed events, MongoDB health, worker logs, and retry timestamps. Handlers are idempotent.

Never log cookies, raw account tokens, passwords, OAuth codes, or email contents.
