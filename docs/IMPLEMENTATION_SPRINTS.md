# Tracer AI Implementation Sprint Plan

> **Superseded ordering:** The MVP ordering below is retained for historical context. The active order and Sprint 2 scope are defined by [ADR-0003](./adr/0003-sprint-2-mvp-ai-amendments.md) and [the approved Sprint 2 plan](./SPRINT_2_IMPLEMENTATION_PLAN.md).

- **Status:** APPROVED PLANNING BASELINE
- **Architecture:** Frozen by `docs/ARCHITECTURE_FREEZE.md`
- **Decision authority:** ADR-0001
- **Estimation method:** Relative complexity only; calendar estimates require team capacity and delivery constraints

## Planning principles

1. Implement one coherent capability at a time.
2. Keep every sprint deployable behind server-authoritative feature flags where exposure would otherwise be premature.
3. Preserve backward-compatible APIs and expand/migrate/contract database changes.
4. Do not defer security, observability, validation, accessibility, or tests to a final cleanup sprint.
5. AI output remains untrusted candidate data until schema and semantic validation succeeds.
6. Every roadmap mutation preserves stable identifiers and uses optimistic concurrency.
7. A sprint is complete only when its production path, rollback path, telemetry, and documentation are complete.

## Complexity scale

- **S:** Narrow infrastructure or isolated behavior with few integration points.
- **M:** One bounded module with persistence, API, client, and tests.
- **L:** Multiple modules or asynchronous workflows with significant invariants.
- **XL:** Critical cross-module workflow involving AI, queues, persistence, recovery, and evaluation.

Complexity is not a duration estimate.

## MVP sprint summary

| Sprint | Outcome                                                         | Complexity | Deployability                       |
| ------ | --------------------------------------------------------------- | ---------- | ----------------------------------- |
| 0      | Repository and production foundation                            | L          | Completed and deployable            |
| 1      | Identity, sessions, profile, and learning profile               | L          | Deployable                          |
| 2      | Editable roadmap domain and progress                            | XL         | Deployable without AI               |
| 3      | Secure uploads and initial resource adapters                    | L          | Deployable behind flags             |
| 4      | Quick and personalized AI roadmap generation                    | XL         | Deployable behind AI flag           |
| 5      | AI optimization, immutable versions, compare, and restore       | XL         | Deployable behind optimization flag |
| 6      | Sharing, export, notifications, analytics, and launch hardening | XL         | MVP release                         |

This is the smallest responsible MVP sequence. Combining Sprints 1–3 would produce an oversized foundational change; combining generation and optimization would make preservation failures difficult to isolate; moving launch capabilities earlier would create rework before the roadmap contract stabilizes.

---

# Sprint 0 — Repository and Production Foundation

**Status:** Completed

## Goal

Create a runnable, architecture-compliant modular-monolith scaffold with enforceable boundaries and production-oriented infrastructure seams.

## Features

- npm workspaces for client, server, and shared contracts.
- React/Vite shell with routing, themes, TanStack Query, Zustand, and placeholder pages.
- Express shell with standardized responses and health endpoints.
- MongoDB, Redis, BullMQ, logging, feature flags, AI engine registry, and resource adapter registry.
- Environment validation, design tokens, linting, formatting, CI, Husky, tests, and architecture checks.
- Frozen ADR and repository governance structure.

## Dependencies

- Approved Documents 1–4.
- ADR-0001 and architecture freeze.
- Node.js 24 and npm 11.

## Estimated complexity

**L**

## Acceptance criteria

- Client and server start successfully.
- Liveness returns 200.
- Readiness reflects MongoDB and Redis state.
- Production builds pass.
- Circular dependencies and prohibited cross-boundary imports fail CI.
- No product feature is implemented.

## Definition of Done

- Repository scaffold is committed and reproducible from the lockfile.
- CI runs architecture, lint, formatting, tests, and builds.
- Architecture is frozen and documented.
- Dependency audit has no known high-severity vulnerability.

## Risks

- Placeholder abstractions could become accidental permanent APIs.
- Dependency upgrades may alter runtime behavior before feature work begins.

## Testing requirements

- Architecture dependency scan.
- Unit tests for response contracts, registries, flags, events, and health snapshots.
- Client and server production builds.
- Live startup and graceful-shutdown smoke test.

---

# Sprint 1 — Identity, Sessions, Profile, and Learning Profile

## Goal

Deliver secure account access and separate stable user identity from evolving learner context.

## Features

### Authentication

- Email/password registration and login.
- Argon2id password hashing.
- Email verification.
- Password reset.
- Google OAuth Authorization Code flow with PKCE, state, and nonce validation.
- Short-lived JWT access cookie.
- Rotating opaque refresh-token cookie with token-family reuse detection.
- Logout, logout-all, and active-session management.
- CSRF and origin protection for mutations.
- Authentication and account rate limits.

### User data

- `users` identity and security record.
- `profiles` for name, declared skills, education, experience, and resume references.
- `learning_profiles` for learning preferences, pace, language, platforms, creators, roadmap style, weekly hours, and AI assumptions.
- Explicit provenance for user-declared versus AI-inferred learning-profile values.
- Inspect, update, reject, and reset inferred preferences.

### Client

- Public and authenticated route groups.
- Login, signup, verification, recovery, profile, learning-profile, and session pages.
- Authentication/session state integration without duplicating server data in Zustand.

## Dependencies

- Sprint 0.
- Transactional email provider configuration.
- Google OAuth credentials.
- MongoDB and Redis.

## Estimated complexity

**L**

## Acceptance criteria

- A user can register, verify, authenticate, refresh, log out, and recover access.
- Refresh tokens rotate and reuse revokes the token family.
- Google accounts link only under the ADR-approved verified-email rules.
- Protected endpoints reject unauthenticated and CSRF-invalid requests.
- Profile and learning profile are independently persisted and authorized.
- Users can remove AI-inferred learning preferences without changing stable profile data.
- Authentication responses never expose credentials or token material in JSON.

## Definition of Done

- Auth and user modules own routes, controllers, services, validation, models/repositories, policies, and tests.
- Database indexes, token cleanup, audit events, logs, and metrics are present.
- Verification and recovery emails work in staging.
- API contracts and client flows are documented.
- Migration and rollback procedures are tested.
- Accessibility checks pass for all forms and errors.

## Risks

- OAuth account-linking mistakes can create account takeover paths.
- Cookie/CSRF behavior can differ between local, staging, and production domains.
- Email delivery failures can block verification and recovery.
- Sensitive profile data may leak through logs or analytics.

## Testing requirements

- Unit tests for password, tokens, cookie options, CSRF, OAuth linking, and policies.
- Integration tests with MongoDB and Redis for rotation, revocation, reuse, and cleanup.
- End-to-end tests for registration, verification, login, refresh, logout, reset, Google OAuth callback, and profile editing.
- Negative tests for brute force, malformed tokens, expired tokens, CSRF, unverified users, and account enumeration.
- Security review against applicable OWASP ASVS Level 2 controls.

## Deployment

Deploy authentication and profile functionality as one release. AI, roadmap, upload, and sharing endpoints remain unavailable. Rollback must preserve created accounts and sessions while the prior release remains schema-compatible.

---

# Sprint 2 — Editable Roadmap Domain and Progress

## Goal

Deliver the complete non-AI roadmap product foundation so roadmaps are ordinary editable application data before generation is introduced.

## Features

### Domain and persistence

- Collections for roadmaps, phases, weeks, tasks, resources, notes, attachments, activities, and versions.
- Stable application-generated UUIDs.
- Fractional ordering keys.
- Schema versions and optimistic concurrency revisions.
- Owner authorization policies.
- Career, skill, project, and interview roadmap type registry entries.

### Manual editing

- Create, read, update, archive, and restore roadmaps.
- Add, edit, move, reorder, and archive phases, weeks, tasks, resources, notes, and milestones.
- Markdown notes with sanitized rendering.
- Deadline, duration, difficulty, priority, and status editing.
- Conflict responses and client refresh/retry behavior.

### Progress

- Task completion as the authoritative state.
- Derived week, phase, and roadmap progress.
- Completed and estimated remaining hours.
- Transactional cache updates and reconciliation job.
- Activity events for meaningful mutations.

### Client

- Roadmap list and editable roadmap timeline.
- Keyboard-accessible drag and drop plus explicit move controls.
- Optimistic updates with rollback.
- Empty, loading, conflict, and error states.

## Dependencies

- Sprint 1 identity and authorization.
- MongoDB transactions and indexes.
- Shared roadmap API and schema contracts.

## Estimated complexity

**XL**

## Acceptance criteria

- Owners can manually create and fully edit all required roadmap levels.
- Moves update bounded records instead of renumbering complete sibling lists.
- Concurrent stale edits return 409 and never silently overwrite data.
- Completed-state changes immediately update derived progress.
- Notes render without executable user content.
- Roadmaps remain within configured operational limits.
- All mutations emit audit/activity facts through the outbox boundary.

## Definition of Done

- Roadmap module owns its domain services, validation, persistence, policies, routes, and tests.
- Shared contracts are versioned and consumed by both client and server.
- Index and query plans are reviewed using representative large-roadmap fixtures.
- Progress reconciliation and position-key compaction jobs are operational.
- Accessibility and responsive behavior pass the supported-browser matrix.
- Rollback and forward migration are verified.

## Risks

- Incorrect collection boundaries can produce excessive queries.
- Fractional keys may become dense under repeated movement.
- Optimistic UI may diverge after failed multi-entity operations.
- Derived progress can drift if mutation paths bypass the domain service.
- Large roadmap rendering may exceed client performance budgets.

## Testing requirements

- At least 90% branch coverage for roadmap mutation, progress, authorization, and concurrency services.
- Property/invariant tests for hierarchy ownership, ordering, movement, and progress calculations.
- Integration tests for transactions, conflicts, indexes, reconciliation, and compaction.
- End-to-end tests for creating, editing, reordering, completing, archiving, and restoring manual roadmaps.
- XSS tests for Markdown, links, code blocks, and checklists.
- Performance tests with maximum representative hierarchy sizes and virtualization thresholds.

## Deployment

Deploy manual roadmaps without AI. This release validates the core data model independently. Roadmap creation is user-driven; upload and AI controls remain feature-flagged off.

---

# Sprint 3 — Secure Uploads and Initial Resource Adapters

## Goal

Create the secure ingestion and normalization boundary required by resume intelligence and resource-aware planning.

## Features

### Uploads

- Private object-storage adapter.
- Quarantine, MIME/signature verification, size enforcement, filename sanitization, malware scan, signed access, retention, and deletion.
- PDF and DOCX text extraction without OCR.
- Upload status and resumable failure handling.
- Resume and roadmap attachment references without embedding binary data.

### Resource detection and normalization

- Input detection for plain text, documentation URL, GitHub repository, YouTube video, YouTube playlist, PDF, and DOCX resume.
- Resource adapter contracts and capability metadata.
- YouTube Data API adapter.
- GitHub public REST API adapter.
- Public documentation adapter with robots, content-type, size, redirect, timeout, and SSRF protections.
- Normalized metadata persistence and cache freshness policies.
- Manual resource addition and availability state.

### Background processing

- File scan and parsing queue.
- Resource metadata queue.
- Persisted statuses, idempotency, retry limits, and dead-letter handling.
- In-app status surfaces; notification delivery is completed in Sprint 6.

## Dependencies

- Sprint 1 identity and profile ownership.
- Sprint 2 resource and attachment domain references.
- Object storage, malware scanner, YouTube API, and GitHub API configuration.
- Redis/BullMQ workers.

## Estimated complexity

**L**

## Acceptance criteria

- Supported files are private, scanned, validated, and parsed asynchronously.
- Invalid, oversized, malicious, or unsupported files never reach parsers.
- Public URL retrieval cannot access private, loopback, link-local, or metadata-service addresses, including after redirects.
- Supported inputs select the correct adapter and normalize into one contract.
- Duplicate jobs do not create duplicate resources or charges.
- Provider failures preserve user input and can be resumed.
- Coursera, Udemy, OCR, and general web scraping remain unavailable.

## Definition of Done

- Upload and resource modules have complete service, policy, adapter, queue, and test boundaries.
- Provider secrets remain in managed configuration and are redacted.
- Retention/deletion jobs remove both database references and provider objects.
- Metadata cache and provider rate-limit metrics are visible.
- Feature flags can disable each provider independently.
- Staging tests use real provider sandboxes/accounts where available.

## Risks

- Malformed documents may exploit parser libraries.
- SSRF and redirect handling are security-critical.
- Provider quotas and API changes can interrupt ingestion.
- Private resumes may be retained after account or upload deletion.
- Parsing jobs can consume excessive memory or CPU.

## Testing requirements

- Unit and contract tests for every adapter.
- Integration tests for upload lifecycle, quarantine, scan result, parsing, retry, and deletion.
- Security fixtures for MIME confusion, zip bombs, oversized documents, malicious Markdown, SSRF, DNS rebinding defenses, and redirect chains.
- Queue idempotency and worker-restart tests.
- Provider error, quota, timeout, deleted-resource, and private-resource tests.
- Load tests for concurrent configured upload and parsing limits.

## Deployment

Deploy uploads and adapters behind per-provider feature flags. Enable internal accounts first, then a measured percentage rollout. Rollback disables flags while retaining safe access to already normalized resources.

---

# Sprint 4 — Quick and Personalized AI Roadmap Generation

## Goal

Deliver the first complete AI planning workflow that converts supported inputs and learner context into validated, editable roadmap data.

## Features

### Contracts and evaluation

- Versioned intent, resume, knowledge, dependency graph, planner, roadmap, and recommendation JSON Schemas.
- Valid, boundary, and invalid fixtures.
- Minimum 100-case privacy-safe evaluation suite across MVP flows before production enablement.
- Baseline quality, schema validity, intent precision, dependency consistency, latency, token, and cost thresholds.

### AI infrastructure

- OpenAI Responses API adapter.
- FAST, CORE, and ESCALATION model profiles from environment configuration.
- External versioned prompts and hashes.
- AI usage ledger for every attempt.
- Per-user/run quotas, timeouts, retries, repair, and escalation policy.
- Persisted `ai_runs` stage machine and idempotent BullMQ execution.
- Engine registration for intent, clarification, profile, resume, knowledge, dependency graph, planner, generation, ranking, and validation.

### Generation workflows

- Intent classification with one primary and optional secondary intents.
- Calibrated one-question clarification flow.
- User, profile, learning-profile, previous-roadmap, and completed-task context retrieval.
- Resume extraction with evidence and confidence.
- Internal planning object as generation source of truth.
- Quick roadmap flow.
- Personalized roadmap flow.
- Infeasible-plan choice: extend deadline, increase hours, or reduce optional scope.
- Semantic validation before transactional persistence.
- Separate roadmap context and generation records.
- Polling UI with stage-based status and resumable failure.

## Dependencies

- Sprints 1–3.
- OpenAI credentials and approved pinned model-profile configuration.
- Completed schemas and evaluation fixtures.
- Redis/BullMQ workers and AI cost monitoring.

## Estimated complexity

**XL**

## Acceptance criteria

- Quick generation asks no clarification when calibrated confidence is sufficient and exactly one question when it is not.
- Personalized generation uses all approved user inputs without exposing private context in logs or analytics.
- Every successful run produces JSON conforming to the versioned roadmap schema and semantic invariants.
- Invalid output is repaired/escalated only within bounded policy and is never persisted as a roadmap.
- Successful output becomes normally editable roadmap state with stable identifiers.
- Failed runs preserve input and resume from the last committed stage.
- Every provider attempt records model, prompt, schema, parameters, tokens, latency, outcome, retry, and cost.
- Evaluation gates meet approved thresholds before public enablement.

## Definition of Done

- All AI engines are registered, versioned, independently testable, and orchestrated without direct roadmap-model access.
- Prompt, schema, and model versions reproduce a run configuration.
- AI endpoints are rate-limited, quota-controlled, idempotent, and asynchronous.
- Monitoring covers stage latency, failures, validation repairs, token usage, cost, and queue age.
- Operational runbooks cover provider outage, queue backlog, budget alert, failed validation, and model rollback.
- Feature rollout and kill switch are tested in staging.

## Risks

- Model output may be structurally valid but pedagogically poor.
- Resume extraction may overstate skill confidence.
- Cost and latency may exceed targets under retries.
- Prompt injection in uploaded or fetched content may influence planning.
- Provider/model changes can introduce silent regressions.
- Large user context can exceed token budgets.

## Testing requirements

- Deterministic schema and semantic tests for every engine boundary.
- AI evaluation suite with at least 100 approved cases.
- Prompt-injection and adversarial-content tests.
- Integration tests for stage persistence, idempotency, retry, resume, timeout, quota, and transactional roadmap creation.
- End-to-end tests for quick, clarification, personalized, resume, URL, and infeasible-plan flows.
- Failure-injection tests at every pipeline stage.
- Load/cost tests for 20 concurrent AI jobs and the generation SLO.

## Deployment

Deploy with the AI-generation flag disabled. Run evaluation and internal staging generation, enable approved internal accounts, then percentage rollout. Disable the flag immediately on budget, validation, or quality regression without affecting manual roadmaps.

---

# Sprint 5 — AI Optimization, Version Compare, and Restore

## Goal

Allow users to improve existing roadmaps while proving that completed work, notes, progress, attachments, and stable identifiers remain intact.

## Features

### Optimization

- Optimization intent analysis.
- Typed add, update, move, replace-resource, and archive operations against stable IDs.
- Affected-section calculation.
- Preservation policy and invariant validator.
- Support for duration changes, workload changes, free resources, YouTube-only, official documentation, language, preferred creators, skipped known topics, interview focus, project emphasis, theory reduction, and difficulty changes.
- Explicit separate full-regeneration path that archives prior current state.

### Context and history

- Immutable optimization records.
- Immutable compressed roadmap snapshots.
- Computed version diffs.
- Optimization rationale and validation result.
- Optimization-stage cost and usage tracking.

### User capabilities

- View version history.
- Compare two versions.
- Restore a version without deleting later history.
- Preview material changes before application when preservation or workload impact warrants it.

## Dependencies

- Sprint 2 stable roadmap hierarchy and concurrency.
- Sprint 4 AI orchestrator, schemas, evaluation, and usage ledger.
- Version snapshot storage and diff contracts.

## Estimated complexity

**XL**

## Acceptance criteria

- Optimization modifies only affected sections.
- Completed tasks, user notes, attachments, progress, and stable identifiers remain unchanged unless the user explicitly authorizes the exact impact.
- Operations against stale revisions fail safely and do not partially apply.
- Every successful AI optimization creates a snapshot, diff, optimization record, and activity event transactionally.
- Compare accurately distinguishes added, removed, moved, and changed entities.
- Restore creates a new current version and retains all historical versions.
- Full regeneration creates a new branch/current state and never destroys prior progress.

## Definition of Done

- Preservation invariants are centralized and cannot be bypassed by controllers or AI engines.
- Optimization and restore use MongoDB transactions and optimistic concurrency.
- Evaluation baselines cover every supported optimization category.
- Version storage, compression, retention, and restoration are load-tested.
- User-facing change summaries are concise and do not expose chain-of-thought.
- Optimization can be disabled independently from generation.

## Risks

- Valid operations may combine into an invalid dependency graph.
- Diff logic may misrepresent moves as delete/add operations.
- Snapshot storage may grow rapidly.
- Concurrent manual edits may race optimization application.
- AI may reinterpret broad requests more aggressively than intended.

## Testing requirements

- At least 90% branch coverage for operation application, preservation, versioning, compare, restore, and authorization.
- Property-based preservation tests across randomized roadmap fixtures.
- Evaluation cases for every optimization category and conflicting instructions.
- Integration tests for transaction rollback, stale revisions, duplicate jobs, and snapshot failure.
- End-to-end tests for optimize, preview, apply, compare, restore, and regenerate.
- Storage/performance tests with maximum supported roadmap and version sizes.

## Deployment

Deploy behind an independent optimization flag. Enable read-only version history first, then restore, then AI optimization by cohort. Rollback disables new operations while preserving all created versions.

---

# Sprint 6 — Sharing, Export, Notifications, Analytics, and MVP Launch

## Goal

Complete the approved MVP with safe distribution, portable output, operational feedback, privacy-conscious measurement, and production release gates.

## Features

### Sharing

- Owner-created private viewer links.
- Hashed 128-bit-or-stronger tokens.
- Default 30-day expiry, explicit no-expiry warning, rotation, revocation, and validation rate limits.
- Anonymous token viewer access.
- Exclusion of private notes, AI context, profile data, source files, and owner analytics.
- Search-indexing prevention.
- Authenticated roadmap duplication with source attribution and explicit progress-copy choice.

### Export

- Versioned canonical JSON export.
- Markdown export.
- Server-generated PDF export through BullMQ.
- Authorization-aware note/content filtering.
- Signed export access and 24-hour object expiry.

### Notifications

- In-app AI completion/failure, export completion/failure, and security/session notifications.
- Read/unread state.
- Transactional verification, reset, and security emails.
- Event-driven consumers through the outbox.

### Analytics and operations

- Consent-aware product events with opt-out for nonessential analytics.
- No prompts, resumes, notes, resource contents, or profile values in analytics.
- Operational dashboards for API, queues, AI stages, providers, costs, exports, database, and Redis.
- Retention and deletion jobs.

### Launch hardening

- Full accessibility, security, performance, backup/restore, and deployment reviews.
- Incident, rollback, provider-outage, and data-deletion runbooks.
- Production feature-flag rollout plan.

## Dependencies

- Sprints 1–5.
- Private object storage and PDF rendering worker.
- Transactional email.
- Approved analytics and observability providers.
- Production hosting, MongoDB Atlas, and managed Redis.

## Estimated complexity

**XL**

## Acceptance criteria

- Private share tokens cannot be recovered from the database and revoke immediately.
- Shared responses never contain owner-private data.
- JSON, Markdown, and PDF exports reflect authorized canonical roadmap state.
- Export jobs are idempotent, observable, resumable where appropriate, and expire objects after 24 hours.
- Notifications are triggered by events, not direct cross-module calls.
- Analytics honor consent and prohibited-field rules.
- Production SLOs and initial supported load are demonstrated.
- Backup restoration meets RPO/RTO targets in a drill.
- All MVP feature flags and kill switches work.

## Definition of Done

- All MVP acceptance criteria from Documents 1–4 and ADR-0001 are traceable to passing tests or operational evidence.
- Security review against OWASP ASVS Level 2 is complete.
- WCAG 2.2 AA review is complete.
- Critical end-to-end journeys pass in staging and production smoke tests.
- Database migrations, deployment, rollback, and worker drain are verified.
- Alerts, dashboards, runbooks, privacy notice inputs, retention, export, and deletion procedures are ready.
- No critical/high exploitable dependency or application vulnerability remains.
- Release notes and changelog are complete.

## Risks

- Share-token leakage grants anonymous read access until revocation/expiry.
- Export rendering can expose private content or consume excessive worker resources.
- Event delivery may duplicate notifications without idempotent consumers.
- Analytics configuration can accidentally collect personal data.
- Final integration may reveal load or provider bottlenecks.

## Testing requirements

- Authorization matrix tests for owner, authenticated non-owner, anonymous valid token, expired token, revoked token, and invalid token.
- Export snapshot/golden tests and private-data exclusion tests.
- Event/outbox at-least-once delivery and consumer-idempotency tests.
- Analytics schema allowlist and consent tests.
- End-to-end MVP journeys from signup through generation, editing, optimization, restore, share, duplicate, and export.
- Penetration/security tests for auth, uploads, SSRF, XSS, CSRF, IDOR, share tokens, rate limits, and data leakage.
- Accessibility tests across supported browsers and 360 px responsive width.
- Load tests at 100 concurrent web sessions and 20 concurrent AI jobs.
- Chaos/failure tests for OpenAI, Redis, MongoDB, storage, email, and provider degradation.
- Backup/restore and deployment rollback drills.

## Deployment

Deploy to staging, complete release gates, then production with all costly/new capabilities disabled by default. Enable manual roadmap access first, generation next, optimization next, and sharing/export last. Monitor each cohort before expansion. This sprint completes the MVP.

---

# Post-MVP Candidate Sprints

These sprints preserve the approved future architecture but are **not authorized for implementation** until explicitly approved. Each capability must be independently feature-flagged and must not bypass the orchestrator, roadmap engine, evaluation suite, authorization, versioning, event, cost, or audit boundaries.

## Sprint 7 — Expanded Roadmap Types and Resource Providers

### Goal

Add certification, bootcamp, course-completion, playlist-completion, custom, and hybrid roadmap modes plus approved commercial-course/blog integrations.

### Features

- New roadmap-type registry entries and planning constraints.
- Coursera/Udemy only with licensed or official API access.
- General search only after provider ADR approval.
- Ranking and evaluation extensions.

### Dependencies

- MVP stability data.
- Provider/legal approval.
- New schemas, prompts, and evaluation cases.

### Estimated complexity

**L**

### Acceptance criteria

- New types require no core roadmap schema redesign.
- Provider adapters pass common contract tests.
- Existing MVP outputs and rankings do not regress.

### Definition of Done

- Provider ADRs, contracts, flags, monitoring, quotas, documentation, and evaluation baselines are complete.

### Risks

- Commercial provider terms or unstable metadata.
- Hybrid roadmap ambiguity and evaluation complexity.

### Testing requirements

- Adapter contracts, roadmap-type invariants, provider failure tests, and expanded AI evaluations.

## Sprint 8 — Editor and Commenter Collaboration

### Goal

Enable authenticated editor/commenter roles and shared notes without introducing real-time collaboration.

### Features

- Invitations and collaborator lifecycle.
- Owner/editor/commenter/viewer policy matrix.
- Shared and private note visibility.
- Revision-based conflicts and collaboration activity.
- Fork lineage and opt-in progress comparison.

### Dependencies

- Stable sharing usage and privacy review.
- Collaboration product specification and superseding ADR if semantics change.

### Estimated complexity

**XL**

### Acceptance criteria

- Every role is enforced server-side.
- Private notes and progress remain isolated.
- Concurrent stale changes never silently overwrite.

### Definition of Done

- Invitation security, policy tests, audit history, conflict UX, notification flows, and migration are complete.

### Risks

- IDOR and visibility leaks.
- Conflict fatigue without real-time synchronization.

### Testing requirements

- Full role/visibility matrix, concurrency tests, invitation abuse tests, and end-to-end collaboration journeys.

## Sprint 9 — AI Mentor

### Goal

Add a roadmap-aware mentor engine through the existing registry and orchestrator.

### Features

- Mentor engine, versioned contracts/prompts, contextual guidance, memory controls, cost quotas, and evaluations.

### Dependencies

- Explicit product specification and approval.
- Mature AI memory controls and evaluation evidence.

### Estimated complexity

**L**

### Acceptance criteria

- Mentor guidance references authorized roadmap context and cannot mutate roadmap state without an explicit validated operation.

### Definition of Done

- Engine registration, evaluations, privacy controls, usage ledger, feature flag, and monitoring are complete.

### Risks

- Chat-like scope expansion, hallucinated advice, and uncontrolled cost.

### Testing requirements

- Grounding, privacy, prompt-injection, cost, latency, and non-mutation tests.

## Sprint 10 — Quiz and Flashcard Engines

### Goal

Generate learning checks through independent AI engines tied to roadmap objectives.

### Features

- Quiz and flashcard contracts, generation, editing, validation, storage, attempts, and evaluations.

### Dependencies

- Explicit feature specifications and assessment-data decisions.

### Estimated complexity

**L**

### Acceptance criteria

- Outputs are editable structured data and traceable to learning objectives.
- Incorrect/ambiguous answer rates remain below approved evaluation thresholds.

### Definition of Done

- Separate engines, schemas, flags, usage ledger, evaluation suites, and accessibility flows are complete.

### Risks

- Incorrect answers, duplicated content, and assessment bias.

### Testing requirements

- Schema, answer-validity, objective-coverage, accessibility, persistence, and AI evaluation tests.

## Sprint 11 — Interview Coach and Progress Intelligence

### Goal

Add interview coaching, weekly planning, and progress reports as separate orchestrator capabilities.

### Features

- Interview coach engine.
- Weekly planner engine.
- Progress report engine.
- User-controlled memory updates.

### Dependencies

- Explicit feature specifications.
- Sufficient consented completion data.

### Estimated complexity

**XL**

### Acceptance criteria

- Each capability registers independently and can be disabled independently.
- Reports distinguish measured facts from AI inference.

### Definition of Done

- Contracts, evaluations, privacy controls, quotas, events, monitoring, and user controls are complete.

### Risks

- Over-personalization from sparse data and sensitive inference.

### Testing requirements

- Evidence/provenance, privacy, inference-labeling, quality, cost, and failure tests.

## Sprint 12 — Voice, OCR, Rich Attachments, and Additional Exports

### Goal

Add approved multimodal inputs and third-party export adapters.

### Features

- Voice input.
- OCR for scanned PDFs.
- Image and voice-note attachments.
- Notion, Google Docs, and calendar exports where approved.

### Dependencies

- Separate provider and privacy decisions.
- Feature-specific ADRs where provider/data-flow choices affect architecture.

### Estimated complexity

**XL**

### Acceptance criteria

- Every new input uses the same secure ingestion boundary.
- Every export is authorization-aware, revocable where possible, and adapter-based.

### Definition of Done

- Provider reviews, consent, retention, flags, accessibility, monitoring, and deletion propagation are complete.

### Risks

- Biometric/audio privacy, OCR errors, provider scopes, and third-party retention.

### Testing requirements

- Format, security, accessibility, provider-contract, privacy, deletion, and failure tests.

## Sprint 13 — Team Collaboration and Real-Time Decision Gate

### Goal

Add team ownership and determine from measured demand whether real-time co-editing is justified.

### Features

- Team/workspace ownership, membership, policies, audit, and shared roadmap administration.
- Real-time collaboration only after a separately approved ADR.

### Dependencies

- Explicit team product specification.
- Collaboration usage evidence.
- Tenant isolation and data-retention decisions.

### Estimated complexity

**XL**

### Acceptance criteria

- Tenant isolation is enforced at every persistence and authorization boundary.
- Real-time technology is not introduced without an approved ADR.

### Definition of Done

- Tenant model, policies, migrations, audit, operational controls, and isolation tests are complete.

### Risks

- Cross-tenant data leakage and major authorization complexity.

### Testing requirements

- Tenant-isolation, role matrix, concurrency, migration, load, security, and disaster-recovery tests.

---

# Global release rules for every sprint

A sprint cannot be marked complete solely because code is merged. Every deployable sprint must satisfy:

1. Architecture check, lint, formatting, unit, integration, contract, and applicable end-to-end tests pass.
2. New configuration is environment-validated and documented in `.env.example` without secrets.
3. Database changes are backward-compatible, schema-versioned, and accompanied by idempotent migrations where required.
4. Security, authorization, rate limiting, redaction, privacy, and retention are implemented for the sprint's data.
5. Logs, metrics, traces, dashboards, and actionable alerts cover the new production path.
6. Feature flags have owners, safe defaults, review/removal dates, and tested kill switches.
7. Queue jobs are idempotent, bounded, observable, retry-safe, and recoverable.
8. API, queue, event, AI, and persisted contracts are versioned and compatibility-checked.
9. Accessibility and supported-browser behavior are verified for changed user journeys.
10. Deployment, migration, rollback, and graceful worker shutdown are tested in staging.
11. Changelog, release notes, runbooks, and relevant engineering documentation are updated.
12. No unrelated refactor or unapproved architecture/framework/technology change is included.
