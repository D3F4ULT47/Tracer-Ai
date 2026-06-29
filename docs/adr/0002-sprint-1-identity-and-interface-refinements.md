# ADR-0002: Sprint 1 Identity and Interface Refinements

- **Status:** FINAL
- **Date:** 2026-06-29
- **Supersedes:** ADR-0001 only where explicitly stated below

## Context

Before Sprint 1 implementation, the approved product direction refined profile navigation, resume ownership, OAuth extensibility, API contract generation, and module coupling. These changes are explicitly approved and preserve the modular-monolith architecture.

## Decisions

### Unified profile experience — FINAL

Profile-related account management uses one `/profile` experience with tabs for General, Resume, Skills, Learning Preferences, Connected Accounts, Privacy, Security, and Sessions. Billing is a reserved future tab and is not implemented or displayed in Sprint 1. Sessions are not a standalone page.

Password recovery and email verification remain flow routes reachable through direct links and authentication actions; they are never primary navigation destinations.

Every page and tab must implement applicable loading, empty, error, and success states before completion.

### Design-system-first delivery — FINAL

UI work proceeds from tokens to reusable components to feature composition to pages. Sprint 1 establishes Button, Input, Select, Modal, Card, Toast, Avatar, Badge, Loader, and Tooltip primitives before authentication pages are composed. Pages may not duplicate primitive interaction or visual logic.

### OAuth provider abstraction — FINAL

Authentication depends on an OAuth provider registry and normalized provider contract, not a Google-specific service. Google is the only enabled Sprint 1 adapter. The contract reserves GitHub and Microsoft as future adapters without implementing or displaying them.

### Contract-driven APIs — FINAL

Every API endpoint is declared once in the shared package. Server route registration and client requests consume the same endpoint definition. Request parameters, request bodies, responses, and error envelopes use shared versioned schemas. Handwritten duplicate route strings or payload contracts are prohibited.

### Learning-profile intelligence metadata — FINAL

AI-managed learning-profile values include confidence, source, updated time, and last-optimized time. User-declared and AI-inferred values remain distinguishable, inspectable, editable, rejectable, and resettable.

### Resume ownership and versioning — FINAL

Resume metadata does not live in `users` or `profiles`. Separate `resumes` and immutable `resume_versions` collections support multiple resumes and version history. Sprint 1 creates ownership and metadata contracts only; upload, parsing, storage-provider integration, and AI extraction remain Sprint 3 work.

### Authentication/user decoupling — FINAL

Authentication owns credentials, sessions, verification, recovery, and OAuth identities. It does not import profile or learning-profile models/services. Successful account creation appends a `user.created` event to the transactional outbox. The user module consumes that event idempotently to create Profile and Learning Profile records. Authentication may reference only the minimal user identity contract required to authenticate an account.

## Consequences

- ADR-0001's separate user/profile/learning-profile decision remains in force.
- ADR-0001 references to resume references inside Profile are superseded by separate resume collections.
- Provider-specific OAuth logic is isolated behind adapters.
- Eventual profile provisioning must be represented by loading/pending UI rather than hidden synchronous coupling.
- No Sprint 2 functionality is authorized by this ADR.
