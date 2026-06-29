# ADR-0001: Foundational Architecture Decisions

- **Status:** FINAL
- **Date:** 2026-06-29
- **Decision owners:** Tracer AI Engineering
- **Scope:** Decisions required before initial product development
- **Supersedes:** None

## Context

Documents 1–4 define Tracer AI as a production-oriented, AI-native learning operating system built as a JavaScript modular monolith. They intentionally leave several product and engineering choices open. This ADR resolves those choices so implementation can proceed without implicit assumptions.

Every decision in this ADR is **FINAL** for the initial implementation. A final decision may be changed only by a later ADR that explicitly supersedes the relevant section. Future features listed here are architectural compatibility requirements, not authorization to implement them in the MVP.

## Decision principles

1. Preserve user work before optimizing convenience.
2. Treat AI output as untrusted candidate data until validated.
3. Prefer a small production-capable MVP over partially implemented breadth.
4. Keep module boundaries enforceable inside the modular monolith.
5. Prefer reversible provider integrations and explicit versioning.
6. Store the minimum sensitive data required and make ownership clear.

---

# MVP Scope

## Decision MVP-1: First production release

**Recommendation:** Ship an authenticated single-user roadmap product with quick and personalized generation, manual editing, progress, versioned AI optimization, a constrained resource set, private sharing, and basic export.

**Why:** This validates Tracer AI's defining loop—plan, edit, learn, optimize—without making provider breadth or real-time collaboration prerequisites for launch.

**Trade-offs:** Some roadmap types, resource providers, and collaboration capabilities will be deferred. The MVP will be narrower but complete and testable.

**Tracer AI adopts — FINAL:**

- Email/password and Google authentication.
- Profile and learning preferences.
- Quick and personalized roadmap creation.
- Roadmap types: career, skill, project, and interview preparation.
- Inputs: plain text, resume PDF/DOCX, documentation URL, GitHub repository, YouTube video, and YouTube playlist.
- Editable phases, weeks, tasks, resources, notes, milestones, duration, difficulty, and deadlines.
- Drag-and-drop reordering and movement.
- Progress calculations.
- AI optimization that preserves completed work, notes, attachments, and identifiers.
- Immutable version history, comparison, and restore.
- Private share links with viewer access.
- Roadmap duplication.
- JSON, Markdown, and PDF export.
- In-app job-completion and failure notifications.
- Operational and privacy-conscious product analytics.

Not in MVP:

- Certification, bootcamp, course-completion, playlist-completion, custom, and hybrid roadmap generation as dedicated modes.
- Coursera and Udemy parsing.
- Blog search as a dedicated integration.
- Editors, commenters, real-time collaboration, shared notes, progress comparison, and invitations.
- Public Explore directory.
- Voice input, images, OCR, voice notes, streaks, AI Mentor, quizzes, flashcards, interview coach, calendar integration, team collaboration, Notion, Google Docs, and calendar exports.
- Billing and paid subscriptions. Usage limits will still exist operationally.

## Decision MVP-2: Meaning of production-ready

**Recommendation:** Define production readiness through measurable acceptance gates rather than feature count.

**Why:** “Production-ready” otherwise remains subjective and encourages late security and reliability work.

**Trade-offs:** These gates add engineering effort before release.

**Tracer AI adopts — FINAL:** MVP release requires passing unit, integration, contract, and critical-path end-to-end tests; security review; accessibility review; backup/restore drill; queue recovery test; load test against the targets in this ADR; deployment rollback test; and preservation-invariant tests for every optimization operation.

---

# Authentication

## Decision AUTH-1: Session architecture

**Recommendation:** Use short-lived JWT access tokens and rotating opaque refresh tokens, both delivered through secure HTTP-only cookies.

**Why:** HTTP-only cookies reduce token theft through JavaScript. Short-lived access tokens limit exposure. Server-stored hashed refresh-token records enable rotation, revocation, device sessions, and reuse detection.

**Trade-offs:** Cookie authentication requires CSRF protection and careful cross-origin configuration. Persisted refresh sessions add database work.

**Tracer AI adopts — FINAL:**

- Access token: signed JWT, 15-minute lifetime.
- Refresh token: cryptographically random opaque value, 30-day absolute lifetime, rotated on every refresh.
- Store only a hash of each refresh token with user, family, expiry, creation time, last-used time, IP summary, user-agent summary, and revocation state.
- Cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax`, narrow `Path`, and no browser storage of tokens.
- Reuse of an invalidated refresh token revokes its entire token family.
- Logout revokes the current session; “log out all devices” revokes all user sessions.

## Decision AUTH-2: CSRF and CORS

**Recommendation:** Use same-site deployment plus origin validation and a synchronizer/double-submit CSRF token for state-changing requests.

**Why:** Cookies are sent automatically and therefore need CSRF defenses. Same-site client/API hosting substantially narrows the attack surface.

**Trade-offs:** Adds client plumbing and complicates local development.

**Tracer AI adopts — FINAL:** Client and API use the same registrable production domain. Mutating requests require a CSRF token and an allowed `Origin`. CORS uses an explicit environment-configured allowlist and never combines wildcard origins with credentials.

## Decision AUTH-3: Account lifecycle

**Recommendation:** Include verification, recovery, linking, and deletion from the beginning.

**Why:** These are baseline SaaS security and user-control requirements, not optional polish.

**Trade-offs:** Requires transactional email and secure token workflows.

**Tracer AI adopts — FINAL:**

- Email verification is required before AI generation, uploads, sharing, or export.
- Password reset tokens are random, single-use, hashed at rest, and expire after 30 minutes.
- Google OAuth uses Authorization Code flow with PKCE, `state`, and `nonce` validation.
- OAuth accounts link automatically only when the provider reports a verified email matching an existing verified account; otherwise explicit authenticated linking is required.
- Users can inspect and revoke active sessions.
- Account deletion begins a 30-day recoverable soft-delete period, then permanently deletes or anonymizes owned data and provider objects according to retention rules.

## Decision AUTH-4: Authorization

**Recommendation:** Centralize policy checks rather than scattering ownership checks across controllers.

**Why:** Sharing and future collaboration make ad hoc authorization unsafe.

**Trade-offs:** Requires a policy layer before collaboration grows.

**Tracer AI adopts — FINAL:** Authentication middleware establishes identity; module-level authorization policies decide owner/share-role access. Services enforce authorization as well as routes. Controllers never implement business authorization.

---

# Database Design

## Decision DB-0: User profile separation

**Recommendation:** Separate stable account/profile identity from the frequently evolving learning profile.

**Why:** Identity data and AI-learning preferences have different change rates, privacy concerns, query patterns, and lifecycle rules. Keeping them separate prevents routine AI-memory updates from rewriting the core user record and gives the user a clear surface for inspecting or resetting learned preferences.

**Trade-offs:** Building complete user context requires one additional lookup or aggregation, and consistency between records must be maintained.

**Tracer AI adopts — FINAL:** Use three distinct records:

- `users`: authentication identity, verification state, provider links, account status, and security metadata.
- `profiles`: display name, contact email reference, resume references, declared skills, education, and experience.
- `learning_profiles`: preferred creators, platforms, resource types, language, learning speed and pace, preferred roadmap style, learning style, weekly hours, budget, AI assumptions, average completion rate, and confidence/provenance for inferred preferences.

There is exactly one active profile and one active learning profile per user. User-declared values and AI-inferred values remain distinguishable. Users can inspect, edit, reject, or reset inferred learning-profile fields. Resume binaries remain in private object storage and only references plus approved extracted data are stored in profile records.

## Decision DB-1: Roadmap persistence model

**Recommendation:** Use reference-based collections for independently editable roadmap entities, with bounded embedded subdocuments only for small immutable metadata.

**Why:** Roadmaps permit unlimited logical notes/resources, frequent movement, versioning, collaboration, and independent editing. A single deeply embedded MongoDB document risks the 16 MB limit, write contention, and expensive array rewrites.

**Trade-offs:** Reads require aggregation or multiple queries, and transactional operations become more important.

**Tracer AI adopts — FINAL:** Separate collections for `roadmaps`, `roadmap_phases`, `roadmap_weeks`, `roadmap_tasks`, `roadmap_resources`, `roadmap_notes`, `roadmap_attachments`, `roadmap_versions`, and `roadmap_activities`. Every entity has a stable application-generated UUID, owner/roadmap reference, position key, timestamps, schema version, and optimistic concurrency version.

## Decision DB-1A: Roadmap AI context separation

**Recommendation:** Keep AI context outside the core roadmap and split current generation context from optimization history.

**Why:** Roadmap reads are frequent and should not carry large prompt inputs, assessments, provenance, or operation histories. AI metadata has separate retention, privacy, and access requirements.

**Trade-offs:** AI optimization requires explicit context queries, and context/version consistency must be transactional.

**Tracer AI adopts — FINAL:** A roadmap stores only the identifiers and summary fields required to render and edit it. Separate collections store:

- `roadmap_contexts`: current goal, assumptions, profile/context references, skill assessment, knowledge graph reference, constraints, preferences, and concise reasoning summary.
- `roadmap_generations`: immutable records for each generation or regeneration, including planning-object reference, prompt/schema/model configuration, run reference, validation result, and created roadmap version.
- `roadmap_optimizations`: immutable optimization requests, targeted sections, proposed/applied operations, preservation checks, result version, and user-visible rationale.

Large stage artifacts use private object storage when they exceed the configured database threshold. Normal roadmap queries do not join these collections. AI operations fetch them through the roadmap-context service, and authorization treats them as owner-private.

## Decision DB-2: Ordering and movement

**Recommendation:** Use lexicographically sortable fractional position keys scoped to each parent.

**Why:** Reordering should update the moved item rather than renumber every sibling.

**Trade-offs:** Keys occasionally require background compaction and need a tested generation library.

**Tracer AI adopts — FINAL:** Phase, week, task, and resource order uses fractional position keys. Moves are atomic service operations that validate parent ownership and dependencies. A maintenance job compacts dense keys when required.

## Decision DB-3: Transactions and concurrency

**Recommendation:** Use MongoDB transactions for multi-document invariants and optimistic concurrency for user edits.

**Why:** Moving hierarchy nodes, restoring versions, and applying AI optimizations touch multiple documents. Concurrent edits must not silently overwrite one another.

**Trade-offs:** Transactions require replica-set support and careful retry handling. Conflict responses require client reconciliation.

**Tracer AI adopts — FINAL:** Every mutable entity has an integer revision. Mutations require the expected revision and return HTTP 409 on conflict. Multi-document hierarchy changes, optimization application, restore, and ownership changes run in transactions with bounded retries.

## Decision DB-4: Versions

**Recommendation:** Store immutable canonical full snapshots for significant AI operations and restoration, with a computed diff stored for display.

**Why:** Full snapshots make restoration reliable and independently auditable. Deltas alone create fragile replay chains.

**Trade-offs:** Full snapshots use more storage.

**Tracer AI adopts — FINAL:** Initial generation, every AI optimization, explicit regeneration, and restore create an immutable compressed snapshot plus metadata and a machine-computed diff. Manual edits are captured in activity history, not a full snapshot per keystroke. Versions are retained for the life of an active roadmap; deleted-roadmap retention follows the account deletion policy.

## Decision DB-5: Limits and retention

**Recommendation:** Keep “unlimited” as a user-facing creation model while enforcing documented abuse and performance limits.

**Why:** No production database can safely accept unbounded objects or payloads.

**Trade-offs:** Very large roadmaps may require users to split content.

**Tracer AI adopts — FINAL:** Initial operational limits are configurable: 100 phases per roadmap, 520 weeks, 10,000 tasks, 20 resources per task, 10,000 notes, 100 attachments, 100 KB per note, and 5 MB canonical JSON per version before compression. Limit increases require measured capacity validation, not schema redesign.

Soft-deleted records remain recoverable for 30 days. Security audit records are retained for 180 days. Operational logs are retained for 30 days. Product analytics raw events are retained for 13 months and then aggregated or deleted.

## Decision DB-6: Notes and content

**Recommendation:** Store Markdown as the authoritative note format.

**Why:** Markdown supports links, code, and checklists; is portable for export; produces clean diffs; and avoids vendor-specific rich-text JSON.

**Trade-offs:** Advanced rich-text interactions are more limited than a block editor.

**Tracer AI adopts — FINAL:** Notes store CommonMark-compatible Markdown plus visibility metadata. The client may provide rich editing controls but persists Markdown. HTML is generated only at render/export time and sanitized. MVP visibility is private/owner-only; the schema reserves shared visibility for collaboration.

## Decision DB-7: Progress

**Recommendation:** Treat task completion as authoritative and higher-level progress as derived data.

**Why:** Independently persisted percentages drift.

**Trade-offs:** Aggregation can be more expensive.

**Tracer AI adopts — FINAL:** Task state and completed duration are authoritative. Week, phase, and roadmap progress are recomputed by a single domain calculator and may be cached on parent records. Mutations update caches transactionally; a reconciliation job detects and repairs drift.

---

# AI Architecture

## Decision AI-1: API surface and provider boundary

**Recommendation:** Use the OpenAI Responses API behind an internal provider adapter.

**Why:** The Responses API is the current unified OpenAI API for structured, tool-capable workflows. An adapter prevents OpenAI request objects from leaking into domain services and preserves provider replaceability.

**Trade-offs:** The adapter limits direct use of provider-specific conveniences and requires mapping code.

**Tracer AI adopts — FINAL:** Only the AI infrastructure adapter imports the OpenAI SDK. The orchestrator consumes internal request/result contracts. The frontend never contacts OpenAI. Provider changes cannot alter roadmap domain schemas.

Reference: [OpenAI Responses API documentation](https://developers.openai.com/api/docs/guides/responses-vs-chat-completions).

## Decision AI-2: Model selection

**Recommendation:** Use task-specific, evaluation-gated model profiles rather than hard-coding one model throughout the codebase.

**Why:** Model quality, latency, availability, and price change. Classification and extraction do not need the same model tier as dependency planning and optimization.

**Trade-offs:** Multiple profiles require evaluation, observability, and configuration management.

**Tracer AI adopts — FINAL:** Define three environment-configured, release-pinned logical profiles:

- `AI_MODEL_FAST`: intent classification, simple extraction, and repair.
- `AI_MODEL_CORE`: knowledge assessment, planning, roadmap generation, and optimization.
- `AI_MODEL_ESCALATION`: one retry for complex failures after validation, subject to cost limits.

The exact model IDs are deployment configuration, never source-code constants. Before each production model change, run the fixed Tracer AI evaluation suite and record quality, latency, and cost in a model-change ADR. Use the current OpenAI flagship general reasoning model as the initial `CORE` candidate and a current small model as `FAST`; pin dated model identifiers when OpenAI makes them available. No automatic migration to a newly released model is allowed.

## Decision AI-3: Structured output and schemas

**Recommendation:** Require strict JSON Schema structured output and independently validate it at the application boundary.

**Why:** Provider-level schema adherence reduces malformed output, while application validation catches semantic problems the schema cannot express.

**Trade-offs:** Strict schemas constrain prompt flexibility and require schema versioning.

**Tracer AI adopts — FINAL:** Every AI stage has a versioned JSON Schema. OpenAI Structured Outputs is used where supported. Results pass JSON Schema validation and domain semantic validation before use. Raw candidate output is never persisted as a roadmap. No HTML, React, or Markdown roadmap output is accepted.

Canonical contracts live under `shared/schemas/ai/`, including at minimum `intent.schema.json`, `resume.schema.json`, `knowledge.schema.json`, `dependency-graph.schema.json`, `planner.schema.json`, `roadmap.schema.json`, `resource-recommendation.schema.json`, and `optimization.schema.json`. File names are kebab-case per repository standards. Schema fixtures include valid, boundary, and invalid examples. CI fails when schemas and consumers become incompatible.

Reference: [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

## Decision AI-4: Orchestration lifecycle

**Recommendation:** Persist every AI request as an idempotent, resumable stage machine executed by BullMQ.

**Why:** Roadmap generation and parsing can outlive HTTP timeouts. Persisted stages enable retries, recovery, visibility, and cost accounting.

**Trade-offs:** Asynchronous generation needs status UI and more operational infrastructure.

**Tracer AI adopts — FINAL:** The API creates an `ai_runs` record and enqueues a job. Stages are input validation, intent, context, profile, optional resume/resource processing, knowledge, dependency graph, planning, roadmap generation, resource ranking, validation, and transactional persistence. Each stage records status, input references, schema/prompt/model versions, generation parameters, attempt count, timestamps, sanitized error, token usage, exact calculated cost when pricing is available, and estimated cost otherwise. User input remains stored if processing fails. A run resumes from the last successfully committed stage.

## Decision AI-5: HTTP delivery and idempotency

**Recommendation:** Use polling for MVP and reserve server events for later.

**Why:** Polling is simple, reliable through common proxies, and adequate for relatively infrequent long-running jobs.

**Trade-offs:** Polling creates repeated requests and less fluid progress than SSE.

**Tracer AI adopts — FINAL:** Generation endpoints require an idempotency key, return HTTP 202 with run ID and status URL, and never hold the request open for full generation. The client polls with exponential backoff and stops on terminal status. Duplicate idempotency keys return the original run. Add SSE only through a later ADR if polling load or UX becomes unacceptable.

## Decision AI-6: Confidence and clarification

**Recommendation:** Use calibrated, engine-specific confidence rather than trusting self-reported model confidence as probability.

**Why:** Model confidence values are not inherently calibrated.

**Trade-offs:** Calibration needs a labeled evaluation set.

**Tracer AI adopts — FINAL:** Each classifier returns confidence and evidence. Initial thresholds are configurable and established before launch using a labeled Tracer AI dataset. Until calibration passes, ambiguous cases ask one clarification rather than auto-generating. Intent must meet a precision target of 95% on the evaluation set to skip clarification. Resume skill confidence below the calibrated threshold triggers one concise question at a time. Threshold changes are configuration changes with evaluation evidence.

## Decision AI-7: Retries, timeouts, and budgets

**Recommendation:** Bound all retries and costs per stage/run.

**Why:** Unbounded retries create duplicated work and unpredictable expense.

**Trade-offs:** Some runs will fail and require user retry.

**Tracer AI adopts — FINAL:** Retry transient provider/network/rate-limit failures up to three attempts with exponential backoff and jitter. Invalid output gets one schema-repair attempt and one escalation-profile attempt. Deterministic validation errors are not retried indefinitely. Every stage has a configurable timeout; the total roadmap run has a 15-minute execution deadline. Every user and run has configurable request/token/cost quotas. Quota exhaustion preserves the run and produces a resumable, user-safe failure.

## Decision AI-8: Prompts, reasoning, and privacy

**Recommendation:** Version external prompt templates and store concise decision summaries, never hidden chain-of-thought.

**Why:** Prompt provenance is required for reproducibility. Private reasoning is unnecessary, potentially sensitive, and not a stable application contract.

**Trade-offs:** Concise summaries provide less debugging detail than raw reasoning.

**Tracer AI adopts — FINAL:** Prompts live under root `prompts/`, use semantic versions, and are referenced by immutable version/hash. Each run records prompt version, schema version, model identifier, temperature or equivalent sampling configuration, reasoning configuration where applicable, and other material generation parameters. Persist goals, assumptions, evidence references, confidence, validation results, and concise user-facing rationale. Do not request or store hidden chain-of-thought. Redact secrets and unnecessary personal data from AI logs.

## Decision AI-9: Optimization and regeneration

**Recommendation:** Apply validated domain operations against stable IDs rather than replacing the roadmap wholesale.

**Why:** Operation-based updates make affected scope explicit and allow preservation invariants to be enforced.

**Trade-offs:** Operation schemas and conflict handling are more complex than replacing JSON.

**Tracer AI adopts — FINAL:** The optimizer returns typed operations such as add, update, move, replace-resource, and archive, each targeting stable IDs. The server rejects operations affecting completed task content, user notes, progress, or attachments unless the user explicitly authorizes that exact impact. A full regeneration creates a new roadmap version and a new editable roadmap branch while archiving the prior current state; it never destroys prior progress.

## Decision AI-10: Infeasible plans

**Recommendation:** Never silently violate time or workload constraints.

**Why:** A roadmap that pretends an infeasible goal is feasible undermines trust.

**Trade-offs:** Users may need another interaction before generation.

**Tracer AI adopts — FINAL:** If deadline, required scope, and weekly hours conflict, return one multiple-choice clarification: extend deadline, increase weekly hours, or reduce optional scope. Required prerequisites cannot be silently removed.

## Decision AI-11: AI engine registry

**Recommendation:** Use a typed internal engine registry with capability metadata and lifecycle hooks; do not create a runtime third-party plugin system.

**Why:** New capabilities such as mentor, quiz, interview, or flashcards should register with the orchestrator instead of expanding central conditionals and cross-module edits. A constrained registry preserves replaceability without introducing untrusted code loading or premature marketplace complexity.

**Trade-offs:** Engines must conform to common contracts, and the registry is additional abstraction before all future capabilities exist.

**Tracer AI adopts — FINAL:** Each AI engine registers a unique name and version, supported request types, input schema, output schema, applicability predicate, declared dependencies, execution mode, timeout class, retry policy, and handler factory. The orchestrator resolves an immutable execution plan from the registry at run creation and stores that plan with the run. Initial registered engines are intent, clarification, profile analysis, resume, resource parsing, knowledge, dependency graph, planner, roadmap generation, resource ranking, validation, and optimization. Future mentor, interview, quiz, and flashcard engines use the same mechanism. Registry entries are trusted application modules shipped with the release; dynamic remote code loading is forbidden.

## Decision AI-12: AI evaluation suite

**Recommendation:** Make a versioned evaluation suite a mandatory gate for prompt, schema, model, orchestration, and engine changes.

**Why:** AI behavior can regress even when code tests pass. Without stable evaluation cases, prompt and model changes are unsafe and cost/latency drift is invisible.

**Trade-offs:** Human-authored cases, rubrics, and periodic review require sustained maintenance. Some quality scoring remains probabilistic.

**Tracer AI adopts — FINAL:** Create `evaluation/` with suites for `career/`, `skill/`, `project/`, `interview/`, `resume/`, `optimization/`, `playlist/`, `resources/`, and adversarial/invalid inputs. Before production launch, the suite contains at least 100 representative, privacy-safe cases across supported MVP flows. Every case pins input, context fixture, expected structural invariants, scoring rubric, and allowed variability. Measure schema validity, intent accuracy, preservation correctness, dependency consistency, factual/resource validity, completeness, verbosity/length, latency, token usage, and cost. Deterministic validators run on every pull request; model-backed evaluations run on AI-affecting pull requests and before release. A model/prompt/schema change cannot ship if critical preservation or schema scores regress, or if quality, p95 latency, or cost exceeds its approved threshold. Evaluation results and baselines are versioned artifacts, not production user data.

## Decision AI-13: AI usage and cost ledger

**Recommendation:** Record normalized usage and cost for every provider attempt, including failed and retried calls.

**Why:** Aggregate billing cannot explain which feature, user flow, engine, prompt, or retry caused spend.

**Trade-offs:** Pricing tables change, and exact cost may be unavailable at request time.

**Tracer AI adopts — FINAL:** Every provider attempt creates an append-only `ai_usage_records` entry linked to AI run, stage, engine, user, roadmap when applicable, provider, model, prompt version, schema version, input tokens, cached-input tokens when reported, output tokens, reasoning tokens when reported, latency, retry number, outcome, provider request ID, pricing-version identifier, and calculated/estimated cost. Pricing configuration is effective-dated and never retroactively overwrites historical calculations. Dashboards aggregate spend by day, feature, engine, model, and outcome. Budget alerts and per-user/per-run quotas consume this ledger. Sensitive prompt or response bodies are not stored in usage records.

---

# Resource Integrations

## Decision RES-1: Provider policy

**Recommendation:** Use official APIs, user-provided URLs, and standards-compliant metadata; do not scrape authenticated or restricted pages.

**Why:** Scraping creates legal, reliability, and maintenance risk.

**Trade-offs:** Coursera/Udemy and some metadata will remain unsupported until approved access exists.

**Tracer AI adopts — FINAL:**

- YouTube Data API for video/playlist metadata.
- GitHub REST API for public repository metadata; authenticated GitHub integration is deferred.
- Direct HTTP retrieval for public documentation pages only when robots directives, terms, response size, and content type permit it.
- PDF/DOCX parsing only for user-uploaded or explicitly authorized files.
- Coursera and Udemy parsing remains out of MVP unless official/licensed API access is obtained.
- No login bypass, paywall bypass, browser automation scraping, or storage of copyrighted course content.

## Decision RES-2: Resource search and recommendation

**Recommendation:** Launch with constrained source discovery rather than an unspecified general web-search dependency.

**Why:** Recommendation quality and licensing are easier to control with official and user-provided sources.

**Trade-offs:** Initial recommendations will cover fewer sources.

**Tracer AI adopts — FINAL:** MVP discovery searches YouTube, GitHub, and a curated allowlist of official documentation domains. General blogs and commercial course catalogs are not automatically searched. Users may manually add any valid URL. Adding a general search vendor requires a provider ADR covering terms, privacy, ranking, and cost.

## Decision RES-3: Normalized resource model

**Recommendation:** Preserve source-specific metadata behind a common resource contract.

**Why:** Common fields support roadmap rendering while an adapter payload prevents loss of useful provider data.

**Trade-offs:** Some provider fields remain opaque to the core domain.

**Tracer AI adopts — FINAL:** Common fields include provider, provider ID, type, canonical URL, title, author, duration, language, difficulty, thumbnail reference, access type, price status if known, fetched time, availability state, completion, rating, AI reason, and metadata version. Provider adapters own extraction and refresh.

## Decision RES-4: Ranking and freshness

**Recommendation:** Use an explainable deterministic score informed by AI-derived features, not an opaque AI rank alone.

**Why:** Users need defensible recommendations and operators need debuggability.

**Trade-offs:** A fixed scoring function may initially be less nuanced.

**Tracer AI adopts — FINAL:** Ranking combines relevance, prerequisite fit, language, duration fit, official-source status, freshness appropriate to the topic, availability, user preference, and creator preference. “Community quality” uses only provider-supported signals such as repository activity or public engagement and is never fabricated. Store score components and the user-facing reason. Refresh volatile metadata after 7 days, documentation after 30 days, and recheck availability when opened or exported.

## Decision RES-5: Uploads

**Recommendation:** Store private source files in access-controlled object storage rather than public Cloudinary delivery URLs.

**Why:** Resumes and attachments contain personal information. Public media defaults are inappropriate.

**Trade-offs:** Private delivery and deletion are more operationally involved.

**Tracer AI adopts — FINAL:** Use Cloudinary authenticated/private assets if the selected account and SDK meet access, deletion, region, and signed-delivery requirements; otherwise use an S3-compatible private object store through the same storage adapter. The adapter choice is deployment configuration. Allow PDF up to 20 MB and DOCX up to 10 MB. Verify extension, MIME type, and file signature; sanitize filenames; malware-scan before parsing; use short-lived signed download URLs; and delete provider objects when retention expires. OCR is deferred.

---

# Collaboration

## Decision COL-1: MVP collaboration model

**Recommendation:** Ship non-real-time, viewer-only private sharing first.

**Why:** This provides useful sharing without introducing simultaneous edit conflicts, invitations, presence, and comment moderation into the MVP.

**Trade-offs:** Editor and commenter roles defined in the domain are not enabled initially.

**Tracer AI adopts — FINAL:** Owners create revocable private share links granting viewer access. Viewers may be anonymous if they possess the token. Shared pages expose roadmap content but not private notes, AI context, profile data, upload source files, or owner analytics. Search indexing is disabled.

## Decision COL-2: Share tokens

**Recommendation:** Store only token hashes and default links to expiry.

**Why:** A leaked database should not reveal usable share links.

**Trade-offs:** Lost plaintext tokens cannot be recovered and must be regenerated.

**Tracer AI adopts — FINAL:** Share tokens contain at least 128 bits of entropy, are displayed once, stored hashed, expire after 30 days by default, and can be rotated or revoked. Owners may select no expiry only through an explicit warning. Rate limits apply to token validation.

## Decision COL-3: Duplicate, fork, and progress comparison

**Recommendation:** Include duplicate in MVP and reserve fork semantics for authenticated collaboration later.

**Why:** Duplicate is useful immediately and has clear ownership. Fork lineage and progress comparison require product definitions not needed for the core loop.

**Trade-offs:** Shared viewers cannot fork in MVP.

**Tracer AI adopts — FINAL:** Duplicate creates an independent roadmap owned by the requesting authenticated user, records source attribution, resets progress by default, and optionally copies progress after explicit confirmation. Attachments are referenced only when access rights permit. Fork, upstream synchronization, and progress comparison are deferred and require a later ADR. For future planning, “progress comparison” means an opt-in aggregate comparison of completion by participant on the same shared roadmap, never public ranking.

## Decision COL-4: Future editing

**Recommendation:** Use optimistic concurrency before considering real-time synchronization.

**Why:** It covers normal sequential edits and remains compatible with later collaborative protocols.

**Trade-offs:** Simultaneous future editors may encounter conflict prompts.

**Tracer AI adopts — FINAL:** No WebSocket collaboration or CRDT is part of MVP. Future editor/commenter roles will first use revision-based mutations and activity records. Real-time co-editing requires evidence of demand and a separate ADR.

---

# Frontend Decisions

## Decision FE-1: Repository organization

**Recommendation:** Use a workspace monorepo with feature-first modules and a small shared-contract package.

**Why:** Feature-first boundaries match the modular-monolith requirement better than global controller/service folders.

**Trade-offs:** This differs from one illustrative technical-folder tree in Document 2.

**Tracer AI adopts — FINAL:**

```text
tracer-ai/
├── client/src/
│   ├── app/
│   ├── assets/
│   ├── components/
│   ├── features/
│   ├── layouts/
│   ├── pages/
│   ├── routes/
│   ├── services/
│   ├── store/
│   ├── styles/
│   ├── theme/
│   └── utils/
├── server/src/
│   ├── config/
│   ├── infrastructure/
│   ├── middlewares/
│   ├── modules/
│   ├── ai/
│   ├── jobs/
│   ├── queues/
│   └── shared/
├── shared/
├── prompts/
├── evaluation/
├── docs/
│   ├── adr/
│   └── rfc/
├── scripts/
├── CHANGELOG.md
├── RELEASE_NOTES.md
└── assets/
```

Each server module contains its controller, service, routes, validation, model/repository, policies, and tests. Root `shared/` contains only framework-neutral JSON Schemas, enumerations, and API contracts; never Mongoose models, secrets, database logic, or server services.

Architecture decisions live in `docs/adr/`. Proposals that require review but are not yet final live in `docs/rfc/`; accepted RFCs either produce an ADR or an implementation issue and are then marked resolved. `CHANGELOG.md` follows Keep a Changelog categories and is updated for user- or operator-visible changes. `RELEASE_NOTES.md` contains concise notes for each production release. Generated evaluation reports and build artifacts are not committed unless explicitly designated as baselines.

## Decision FE-2: JavaScript typing and validation

**Recommendation:** Remain JavaScript-only while using JSDoc and runtime schemas.

**Why:** This respects the explicit no-TypeScript requirement while retaining editor assistance and trustworthy boundaries.

**Trade-offs:** Static guarantees are weaker than TypeScript.

**Tracer AI adopts — FINAL:** Use `.js`/`.jsx` only. `types/` may contain JSDoc typedef modules but no TypeScript. All API, environment, AI, queue, and persisted boundary inputs are runtime-validated from shared JSON Schema-compatible contracts.

## Decision FE-3: State ownership

**Recommendation:** Keep server state in TanStack Query and restrict Zustand to the approved global UI/session concerns.

**Why:** Duplicating server data in Zustand creates cache divergence.

**Trade-offs:** Some cross-page workflows require careful query-cache updates.

**Tracer AI adopts — FINAL:** TanStack Query owns roadmaps, profiles, resources, jobs, shares, and notifications fetched from the server. Zustand owns authenticated-user presentation state, theme, sidebar state, and the selected/current-roadmap identifier or ephemeral editing coordination—not authoritative roadmap documents. Local component state owns modals, forms, and transient UI.

## Decision FE-4: API conventions

**Recommendation:** Use versioned REST with cursor pagination, machine-readable error codes, and idempotent async commands.

**Why:** REST aligns with Document 2 and is sufficient for the domain.

**Trade-offs:** Hierarchical edits require several explicit endpoints.

**Tracer AI adopts — FINAL:** APIs are under `/api/v1`. Lists use cursor pagination with configurable limit, stable sort, and explicit filters. Success and error envelopes follow Document 2, extended with `error.code`, `error.details`, and `requestId`. Validation errors contain field-safe details. AI commands use idempotency keys. Breaking changes require `/api/v2`; additive changes remain in v1.

## Decision FE-5: Job progress UX

**Recommendation:** Present durable stage-based progress without fabricated percentages.

**Why:** AI stage duration is unpredictable.

**Trade-offs:** Progress appears less granular.

**Tracer AI adopts — FINAL:** The UI displays queued, analyzing intent, analyzing context/resources, planning, generating, validating, saving, completed, or failed. Polling uses 2-second intervals initially, backs off to 10 seconds, pauses when the tab is hidden, and immediately refreshes on focus.

## Decision FE-6: Rich text, drag-and-drop, and conflicts

**Recommendation:** Use a Markdown editor and accessible dnd-kit interactions with explicit conflict recovery.

**Why:** It matches the canonical note format and roadmap editing requirements.

**Trade-offs:** Markdown is less WYSIWYG; accessible drag/drop requires extra work.

**Tracer AI adopts — FINAL:** Notes use a Markdown editor with sanitized preview. Drag/drop supports pointer and keyboard operation. Optimistic reordering snapshots prior query data and rolls back on failure. HTTP 409 opens a conflict UI offering refresh or retry against current data; silent last-write-wins is forbidden.

## Decision FE-7: Design, accessibility, browsers, and responsive behavior

**Recommendation:** Build a first-party component system using Tailwind tokens and WAI-ARIA patterns.

**Why:** It supports the GitHub visual language without tying the product to a conflicting design system.

**Trade-offs:** More initial design-system work.

**Tracer AI adopts — FINAL:** Support GitHub Light and Dark through layered design tokens mapped into CSS variables and then Tailwind. The token hierarchy is:

- Primitive tokens: raw palette, spacing, typography, radius, shadow, and motion values; confined to theme definitions.
- Semantic tokens: background, foreground, muted, border, accent, success, warning, danger, info, focus, and overlay roles.
- Component tokens: only where a reusable component cannot be expressed cleanly with semantic tokens.

Components may reference semantic/component tokens only; raw values such as `#24292f` are forbidden outside theme files. Both themes must satisfy WCAG contrast requirements, and token changes receive visual-regression testing. Target WCAG 2.2 AA. Support the latest two stable versions of Chrome, Edge, Firefox, and Safari. Support responsive widths from 360 px upward; roadmap editing must remain functional on mobile, although dense drag/drop may use move controls. Respect reduced-motion preferences.

## Decision FE-8: Voice and admin routes

**Recommendation:** Do not expose nonfunctional controls.

**Why:** A visible voice button or admin route implies supported behavior.

**Trade-offs:** The MVP homepage differs slightly from the eventual design.

**Tracer AI adopts — FINAL:** Voice input and admin routes are deferred. The voice button is absent, not disabled or mocked. The route architecture reserves future protected groups without shipping empty pages.

## Decision FE-9: Export behavior

**Recommendation:** Make exports server-generated, versioned, and content-focused.

**Why:** Server rendering provides consistent output and keeps sensitive data selection enforceable.

**Trade-offs:** PDF generation consumes worker resources.

**Tracer AI adopts — FINAL:** JSON exports the canonical public roadmap contract and schema version; Markdown exports the hierarchy, objectives, tasks, resources, and notes the requester may access; PDF uses a clean branded print layout with title, generation date, hierarchy, progress, and accessible links. Private notes and AI context are owner-only and excluded by default. Large PDF exports run in BullMQ and expire from object storage after 24 hours.

## Decision FE-10: Notifications and analytics

**Recommendation:** Keep both systems event-driven and narrow in MVP.

**Why:** Domain events prevent direct module coupling.

**Trade-offs:** Event processing adds infrastructure and eventual consistency.

**Tracer AI adopts — FINAL:** In-app notifications cover AI run completion/failure, export completion/failure, and security/session events. Email is used only for verification, password reset, and material security notices. Analytics capture consented product events and server operational metrics; prompts, resume text, note bodies, resource contents, and personal profile values are never analytics properties. Users may opt out of nonessential product analytics.

---

# Infrastructure

## Decision INF-1: Runtime and package management

**Recommendation:** Pin an active Node.js LTS release and use npm workspaces.

**Why:** npm is universally available with Node and workspaces are sufficient for this modular monorepo.

**Trade-offs:** Other package managers can be faster but add tooling policy.

**Tracer AI adopts — FINAL:** Use the current active Node.js LTS available at implementation start, pinned in `.nvmrc`, `engines`, CI, and deployment images. Use npm workspaces for client, server, and shared contracts, with a committed lockfile. Upgrades require CI verification and dependency review.

## Decision INF-2: Environment and secrets

**Recommendation:** Validate environment configuration at process startup and use managed secret storage in production.

**Why:** Missing or malformed configuration should fail before serving traffic.

**Trade-offs:** Startup is strict and local setup requires complete configuration.

**Tracer AI adopts — FINAL:** `.env.example` documents non-secret names. Local `.env` files remain untracked. Production secrets live in the hosting platform's secret manager. Configuration is parsed once, runtime-validated, immutable, and injected into modules. Secrets are never logged.

## Decision INF-3: Queue topology

**Recommendation:** Run API and BullMQ workers as separately scalable process types.

**Why:** Long AI and parsing jobs should not compete with request handling or force coupled scaling.

**Trade-offs:** Deployment has more than one process.

**Tracer AI adopts — FINAL:** One codebase and release artifact produces an API process and worker process. Use separate queues for AI runs, resource parsing, file scanning/parsing, exports, notifications, and maintenance. Jobs have idempotency keys, bounded attempts, backoff, timeouts, and dead-letter state. Queue payloads contain identifiers, not sensitive full documents.

## Decision INF-4: Observability

**Recommendation:** Use structured logs, metrics, traces, and error reporting with shared request/run IDs.

**Why:** Cross-system AI and queue failures are otherwise difficult to diagnose.

**Trade-offs:** Telemetry increases cost and requires redaction discipline.

**Tracer AI adopts — FINAL:** Emit JSON logs with request ID, user ID hash, module, AI run ID, job ID, latency, status, and safe error code. Use OpenTelemetry-compatible instrumentation. Track API latency/errors, queue depth/age, job failures, provider latency/errors, token usage, validation retries, MongoDB latency, Redis health, and export duration. Alert on SLO breaches and queue backlog. Never log tokens, cookies, prompts containing personal data, resume text, notes, or file contents.

## Decision INF-5: Email and malware scanning

**Recommendation:** Place transactional email and scanning behind adapters.

**Why:** Providers may change and neither belongs in domain logic.

**Trade-offs:** Adds interface work.

**Tracer AI adopts — FINAL:** Use a transactional email provider selected during deployment through an email adapter. Use a managed malware-scanning service or isolated ClamAV worker through a scanning adapter. Files remain quarantined and inaccessible to parsers until scan success.

## Decision INF-6: Feature flags

**Recommendation:** Introduce server-authoritative feature flags before shipping optional or incomplete capabilities.

**Why:** Flags allow controlled rollout, fast disablement, internal testing, and progressive exposure without maintaining long-lived code branches.

**Trade-offs:** Flags create state combinations, testing overhead, and cleanup debt. They are not an authorization system.

**Tracer AI adopts — FINAL:** Use a feature-flag service behind an internal adapter with local-development defaults and a cached server-side snapshot. Flags support global, environment, percentage, account, and user targeting. The server is authoritative for capability access; client flags control presentation only. Initial reserved flags cover voice, OCR, editor collaboration, mentor, flashcards, advanced analytics, new AI engines, and provider integrations. Every flag has an owner, purpose, creation date, expected removal/review date, safe default, and kill-switch behavior. CI checks for expired flags. Permanent product entitlements and security permissions never use feature flags.

---

# Performance

## Decision PERF-1: Service objectives

**Recommendation:** Establish explicit initial SLOs and revisit them using production evidence.

**Why:** Architecture cannot be evaluated without targets.

**Trade-offs:** Targets require monitoring and may constrain implementation choices.

**Tracer AI adopts — FINAL:**

- Monthly API availability target: 99.9%, excluding announced maintenance and external-provider failures surfaced gracefully.
- Read API p95: under 300 ms server time for cached/common requests.
- Mutation API p95: under 500 ms server time, excluding asynchronous work.
- Job-creation response p95: under 500 ms.
- Initial roadmap generation: 95% complete within 5 minutes; hard run deadline 15 minutes.
- Progress mutation visible optimistically within 100 ms and confirmed by API within the mutation SLO.
- Initial supported load: 10,000 registered users, 1,000 daily active users, 100 concurrent web sessions, and 20 concurrent AI jobs, with horizontal scaling paths preserved.

## Decision PERF-2: Caching

**Recommendation:** Cache only reproducible, non-authoritative derived data.

**Why:** Caching roadmap state risks stale edits; metadata and public provider responses benefit greatly.

**Trade-offs:** Some reads continue to hit MongoDB.

**Tracer AI adopts — FINAL:** Redis caches rate-limit counters, short-lived job status, public resource metadata, URL detection results, and repeated AI metadata keyed by normalized input plus prompt/model/schema versions. MongoDB remains authoritative for users and roadmaps. Cache invalidation occurs on relevant mutations. Sensitive resume-derived content is not placed in shared caches.

## Decision PERF-3: Client performance

**Recommendation:** Set budgets and add virtualization only when list size warrants it.

**Why:** Premature virtualization complicates editing, but large roadmaps must remain usable.

**Trade-offs:** Two rendering paths may eventually be needed.

**Tracer AI adopts — FINAL:** Route-level code splitting and lazy loading are mandatory. Target initial compressed JavaScript below 250 KB excluding lazily loaded route chunks. Virtualize task/resource lists when a rendered list exceeds 200 rows. Memoization must be evidence-based. Images use responsive sizing and lazy loading.

## Decision PERF-4: Testing and capacity gates

**Recommendation:** Use risk-based coverage gates rather than one global percentage.

**Why:** High aggregate coverage can still miss preservation and authorization failures.

**Trade-offs:** Requires tailored suites.

**Tracer AI adopts — FINAL:** Require 90% branch coverage for authentication, authorization, roadmap mutation, progress, versioning, and optimization-application domain services; 80% branch coverage for other server business logic; contract tests for every API and queue payload; integration tests with MongoDB/Redis; and end-to-end tests for signup, generation, editing, optimization, restore, share, and export. Load tests must demonstrate the SLOs at the initial supported load before production release.

---

# Security

## Decision SEC-1: Security baseline

**Recommendation:** Adopt OWASP ASVS Level 2 as the application security baseline.

**Why:** Tracer AI handles authentication, private documents, generated content, and sharing.

**Trade-offs:** Adds formal security work to release gates.

**Tracer AI adopts — FINAL:** Design and release reviews use OWASP ASVS Level 2 and the OWASP API Security Top 10. Dependencies are scanned in CI; critical/high exploitable findings block release. Production uses TLS only, HSTS, secure headers, strict content security policy, and least-privilege credentials.

## Decision SEC-2: Input and content safety

**Recommendation:** Validate at every trust boundary and sanitize for the target context.

**Why:** User text, AI output, documents, URLs, and Markdown are all untrusted.

**Trade-offs:** Some content or URLs will be rejected.

**Tracer AI adopts — FINAL:** Runtime-validate API inputs, queue payloads, AI outputs, provider responses, and environment data. Sanitize rendered Markdown/HTML with an allowlist. Escape plain text by default. Reject dangerous URL schemes. Public URL fetching uses DNS/IP validation, redirect limits, response-size/time limits, private-network blocking, and revalidation after redirects to prevent SSRF.

## Decision SEC-3: Rate limits and quotas

**Recommendation:** Apply route- and identity-aware limits with stricter controls for expensive or unauthenticated actions.

**Why:** Authentication, share tokens, uploads, and AI endpoints have different abuse profiles.

**Trade-offs:** Legitimate bursts may be throttled.

**Tracer AI adopts — FINAL:** Redis-backed limits apply by IP and user/session. Login, verification, reset, share-token validation, uploads, AI generation, optimization, exports, and provider fetches have independent configurable policies. AI concurrency is capped per user. Responses include safe retry timing. Exact thresholds are operational configuration tuned from testing, not hardcoded business logic.

## Decision SEC-4: Encryption and keys

**Recommendation:** Use managed encryption at rest plus application-level protection for selected secrets.

**Why:** Infrastructure encryption is baseline; refresh tokens and provider credentials need narrower handling.

**Trade-offs:** Key rotation adds operational procedures.

**Tracer AI adopts — FINAL:** TLS protects data in transit. MongoDB Atlas, Redis, backups, and object storage use managed encryption at rest. Passwords use Argon2id with reviewed parameters. Refresh/reset/verification/share tokens are hashed with a keyed or slow one-way construction as appropriate. OAuth/provider credentials use managed secrets. Signing keys are asymmetric, versioned, rotated, and exposed through a JWKS-compatible internal verifier where needed.

## Decision SEC-5: Privacy, residency, and deletion

**Recommendation:** Minimize AI disclosure and select one deployment region per environment.

**Why:** Resumes and learning history are personal data. Cross-region processing complicates compliance.

**Trade-offs:** Regional constraints may reduce provider choices.

**Tracer AI adopts — FINAL:** Launch production in an India-adjacent region with the best common availability across MongoDB, Redis, object storage, and hosting; select and document the exact region before provisioning, and keep primary data services co-located. Because exact legal/data-residency obligations depend on the operating company and customer geography, no claim of statutory residency compliance is made without legal review. Send only necessary fields to AI providers, disclose processing in the privacy notice, honor export/deletion requests, and maintain a data-processing inventory. Enterprise residency is deferred.

## Decision SEC-6: Auditability

**Recommendation:** Record security and high-value domain actions in append-only audit events.

**Why:** Account compromise, sharing, optimization, restoration, and deletion require traceability.

**Trade-offs:** Audit events consume storage and must avoid sensitive payloads.

**Tracer AI adopts — FINAL:** Audit login/session changes, password/OAuth changes, upload lifecycle, share creation/revocation, role changes, AI generation/optimization application, version restore, export, and deletion. Store actor, action, target identifiers, timestamp, request ID, result, and safe metadata—not content bodies or secrets.

---

# Deployment

## Decision DEP-1: Hosting topology

**Recommendation:** Deploy containers to a managed container platform, MongoDB Atlas, and managed Redis.

**Why:** Tracer AI needs separately scalable API and workers, long-running jobs, and predictable networking. Serverless function time limits are a poor default for BullMQ workers.

**Trade-offs:** Containers require more operational ownership than static/serverless-only hosting.

**Tracer AI adopts — FINAL:**

- Client: static assets served through a CDN.
- API: stateless container service with at least two production instances.
- Workers: separate container service scaled by queue depth and concurrency.
- Database: MongoDB Atlas replica set.
- Redis: managed Redis compatible with BullMQ persistence requirements; no eviction policy that can discard queue keys.
- Files: private object storage through the storage adapter.
- Environments: local, test, staging, and production with isolated databases, Redis, storage, OAuth credentials, and secrets.

The exact cloud vendor is intentionally replaceable and selected during provisioning based on region, managed-service availability, contractual requirements, and cost. Vendor selection does not block application architecture.

## Decision DEP-2: CI/CD and release strategy

**Recommendation:** Use trunk-based development with short-lived conventional branches and automated staged deployment.

**Why:** Small changes and automated gates reduce release risk.

**Trade-offs:** Requires reliable tests and migration discipline.

**Tracer AI adopts — FINAL:** Pull requests run lint, formatting checks, tests, schema compatibility checks, dependency/security scans, and production builds. Merges to the protected main branch deploy automatically to staging. Production deployment requires approval and uses rolling or blue/green rollout with health gates. Rollback redeploys the prior immutable image; database changes must be backward-compatible through the rollback window.

## Decision DEP-3: Migrations

**Recommendation:** Use explicit, idempotent forward migrations and schema-versioned read compatibility.

**Why:** Mongoose schema changes alone do not safely transform existing data.

**Trade-offs:** Every data-shape change requires migration planning.

**Tracer AI adopts — FINAL:** Migration scripts live under `scripts/migrations`, have unique IDs, record execution, support dry-run, and are idempotent. Use expand/migrate/contract changes. Destructive contraction occurs only after compatibility verification and backup. AI and roadmap records retain schema versions with dedicated upcasters where necessary.

## Decision DEP-4: Backup and disaster recovery

**Recommendation:** Use managed point-in-time recovery and verify restoration regularly.

**Why:** Backups that have never been restored are not reliable safeguards.

**Trade-offs:** Backup retention and drills cost money and time.

**Tracer AI adopts — FINAL:** MongoDB uses continuous point-in-time backup with 35-day retention plus monthly snapshots retained for 12 months. Object storage uses versioning or equivalent protection for active assets. Redis queues are durable but not the source of truth; persisted run/job state enables reconstruction. Initial recovery objectives are RPO 15 minutes and RTO 4 hours. Conduct quarterly restore drills.

## Decision DEP-5: Health, readiness, and shutdown

**Recommendation:** Separate liveness from dependency readiness and drain gracefully.

**Why:** Deployments and failures must not accept work that cannot be completed.

**Trade-offs:** Health logic is more nuanced than a single endpoint.

**Tracer AI adopts — FINAL:** Liveness checks process health only. Readiness checks required MongoDB/Redis connectivity and configuration. OpenAI or optional resource-provider outages do not kill the API; affected features report degraded status. API shutdown stops accepting requests and drains active requests. Worker shutdown pauses intake, completes or safely releases jobs, and persists status.

---

# Future-proofing

## Decision FUT-1: Modular-monolith boundaries

**Recommendation:** Enforce module APIs and dependency direction without distributed-service complexity.

**Why:** Future extraction is possible only if boundaries are real today.

**Trade-offs:** Internal calls are slightly more formal.

**Tracer AI adopts — FINAL:** Modules export application services, policies, contracts, and domain events only. No module imports another module's controller, route, Mongoose model, or private utility. AI never writes roadmap collections directly. Circular imports fail CI through dependency rules. No microservices are introduced for the initial product.

## Decision FUT-2: Domain events

**Recommendation:** Make domain events the default integration mechanism for completed domain facts, using a transactional outbox for durable asynchronous effects.

**Why:** Notifications, analytics, activity, and future service extraction should not be coupled into core transactions.

**Trade-offs:** Outbox processing introduces eventual consistency and deduplication requirements.

**Tracer AI adopts — FINAL:** Domain services append outbox events in the same MongoDB transaction as state changes. A worker publishes/handles events idempotently. Roadmap, authentication, profile, learning-profile, resource, sharing, upload, export, and AI modules emit past-tense domain facts for material state transitions—for example `roadmap.created`, `roadmap.optimized`, `task.completed`, `learning-profile.updated`, `ai-run.failed`, `share.created`, and `export.completed`. Analytics, notifications, activity history, AI-memory updates, and future achievements subscribe independently; the originating service never calls those consumers directly.

Event names, payload schemas, aggregate IDs, causation/correlation IDs, occurrence time, producer, tenant/user scope, and schema versions are explicit. Consumers are idempotent and track processed event IDs. Delivery is at least once; event order is guaranteed only per aggregate where required. Events carry identifiers and minimal safe facts, not resumes, note bodies, prompts, or large roadmap snapshots. In-process synchronous events are allowed only for non-failing local reactions that do not require durability. Queries and commands that require an immediate transactional result remain direct service calls rather than being forced through events.

## Decision FUT-3: External adapters

**Recommendation:** Put OpenAI, storage, email, scanning, search, YouTube, GitHub, analytics, and export rendering behind narrow adapters.

**Why:** These vendors are independently replaceable modules under the product principles.

**Trade-offs:** Interfaces require deliberate design and testing doubles.

**Tracer AI adopts — FINAL:** Domain and application services depend on adapter interfaces, not vendor SDK objects. Each adapter has contract tests, normalized errors, timeouts, telemetry, and capability flags.

## Decision FUT-4: Schema and contract evolution

**Recommendation:** Version durable schemas independently and maintain backward-compatible readers.

**Why:** Roadmaps and AI versions may outlive multiple releases.

**Trade-offs:** More metadata and migration code.

**Tracer AI adopts — FINAL:** Roadmaps, planning objects, AI stage outputs, resources, versions, API payloads, queue payloads, and domain events each carry explicit schema versions. Additive evolution is preferred. Consumers ignore unknown additive fields. Breaking evolution uses upcasters or a new major contract.

## Decision FUT-5: Future roadmap and AI capabilities

**Recommendation:** Add capabilities through registries and orchestrator stages, never by branching core code per feature everywhere.

**Why:** The documents require future roadmap types and AI features without redesign.

**Trade-offs:** Registries add a small abstraction before many variants exist.

**Tracer AI adopts — FINAL:** Roadmap types register validation, planning constraints, and presentation metadata against common roadmap contracts. New AI capabilities register through the AI engine registry defined in AI-11, with declared inputs, outputs, dependencies, applicability, and operational policies. They may not bypass evaluation gates, validation, persistence, authorization, versioning, cost accounting, or audit requirements. Avoid a general-purpose third-party plugin framework beyond these narrow trusted registries.

## Decision FUT-6: Decision governance

**Recommendation:** Keep consequential architecture changes auditable through ADRs.

**Why:** This document is useful only if future deviations are explicit.

**Trade-offs:** Adds a small documentation step.

**Tracer AI adopts — FINAL:** A new ADR is required for changes to MVP boundaries, authentication/session strategy, core data ownership, AI API/model policy, collaboration consistency, privacy retention, deployment topology, provider selection with lock-in implications, or service extraction. ADRs are immutable after acceptance except for typo corrections; changes supersede them.

---

# Resolution summary

This ADR resolves all pre-development clarifications from the architecture plan:

- The MVP boundary and deferred features are explicit.
- Repository organization, ADR/RFC/change documentation, shared-code scope, JavaScript typing, APIs, and frontend behavior are fixed.
- Authentication, verification, recovery, OAuth linking, sessions, CSRF, and deletion are fixed.
- User/profile/learning-profile separation and roadmap/context/generation/optimization-history separation are fixed.
- Roadmap storage, ordering, concurrency, versioning, notes, limits, and progress authority are fixed.
- OpenAI integration, engine registry, model policy, JSON contracts, orchestration, evaluation, confidence, retries, cost ledger, prompts, optimization, and regeneration are fixed.
- Resource providers, search scope, ranking, uploads, storage, and OCR scope are fixed.
- Sharing, anonymous viewers, token behavior, duplication, future forks, and real-time collaboration are fixed.
- Notification, analytics, export, design tokens, accessibility, browser, mobile, and voice scope are fixed.
- Runtime, queues, feature flags, observability, caching, performance, testing, and security baselines are fixed.
- Deployment topology, environments, CI/CD, migrations, backup, recovery, health, and shutdown are fixed.
- Module boundaries, comprehensive outbox domain events, adapters, schema evolution, and ADR governance are fixed.

Development may begin against these decisions. Any intentional deviation requires a superseding ADR.
