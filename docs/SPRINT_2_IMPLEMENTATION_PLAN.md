# Sprint 2 — AI Engine and Roadmap Generation

- **Status:** APPROVED
- **Architecture amendment:** ADR-0003
- **Execution:** Synchronous request lifecycle
- **Storage:** Embedded roadmap hierarchy

## Delivery packages

1. **Foundation — complete:** AI configuration, provider boundary, JSON Schemas, versioned prompts, and persistence models.
2. **Input infrastructure — complete:** Natural-language and project validation, temporary resume upload, PDF validation and extraction, text normalization, deterministic classification, and cleanup. No AI calls.
3. **Learner intelligence — complete:** Evidence-grounded AI assessment across natural-language goals, project descriptions, resume text, or combined inputs; known, missing, and suggested skills; proficiency; experience, education, technology, career, and project-complexity signals; calibrated confidence; and a clarification-required decision. No Learning Context or roadmap output.
4. **Learning context — complete:** Canonical learner context assembled from supported inputs and profile data with explicit provenance.
5. **Clarification engine — complete:** At most one material clarification before generation.
6. **Roadmap planning engine — complete:** One-pass complete roadmap and internal dependency graph generation, validation, and immediate Version 1 persistence.
7. **Interactive Roadmap Workspace — complete:** Direct post-generation navigation, roadmap hierarchy, task-authoritative progress, editing, lightweight autosave, internal versions with matching graph snapshots, soft deletion, duplication, and My Roadmaps.
8. **Frontend polish — complete:** Anonymous Quick Mode preview, authenticated persistence, end-to-end loading and recovery states, responsive layouts, theme verification, keyboard focus, UX refinements, and remaining application wiring.

## Package 2.8 runtime verification

- Anonymous visitors can ingest text and request a complete roadmap preview without authentication.
- Authentication is required only when the learner saves the preview or uses a persistent workspace capability.
- The public homepage remains usable when the session endpoint is unavailable or slow.
- Account registration, login, authenticated navigation, empty roadmap states, profile navigation, theme switching, and mobile layout were verified in the live browser.
- OpenAI returned `insufficient_quota` during the live generation walkthrough. The application preserved the learner input and showed a retryable, human-readable error. Schema, pipeline, preview, persistence, and workspace behavior remain covered by automated tests; a successful live provider generation requires an API project with available quota.
- Profile provisioning depends on the approved domain-event worker. When that worker is unavailable, Profile shows a recoverable setup state instead of crashing.

## Sprint boundary

Sprint 2 excludes queues, polling, resumable jobs, optimization, external resource integrations, sharing, collaboration, malware scanning, long-term resume retention automation, usage dashboards, and the production-scale evaluation suite.

## Persistence rule

Generation validates and immediately persists Roadmap Version 1, then navigates the authenticated learner directly into the Interactive Roadmap Workspace. Every later meaningful editing session creates a matching roadmap and planning-graph version. Raw model responses are never persisted.
