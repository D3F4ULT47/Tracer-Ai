# ADR-0003: Sprint 2 MVP AI Amendments

- **Status:** FINAL
- **Date:** 2026-06-30
- **Scope:** Sprint 2 AI roadmap generation only
- **Supersedes:** The previous sprint ordering and the Sprint 2 implementation details of ADR-0001 where explicitly stated below

## Context

Tracer AI must validate its core roadmap-generation experience before investing in asynchronous execution, highly normalized roadmap storage, or production-scale AI operations. The approved product sequence now places AI roadmap generation immediately after the application foundation.

## Decisions

### Sprint order — FINAL

The active order is Foundation; AI Engine and Roadmap Generation; Roadmap Experience and Resource Intelligence; AI Optimization; Sharing and Collaboration; Learning Circle. The previous ordering is deprecated.

### Synchronous Sprint 2 generation — FINAL

Sprint 2 executes generation within the HTTP request lifecycle. BullMQ, polling, resumable jobs, queue retries, and persisted per-stage state are not implemented for generation in this sprint. Provider and orchestration boundaries must remain compatible with a later asynchronous executor, which requires a separate ADR amendment before activation.

`ai_runs` remains an audit and lifecycle record for one synchronous attempt, not a resumable stage machine.

### Embedded roadmap hierarchy — FINAL

Sprint 2 stores phases, weeks, tasks, resources, and notes as bounded nested roadmap subdocuments. The separate collections retained are `roadmaps`, `roadmap_versions`, `roadmap_contexts`, `roadmap_generations`, `ai_runs`, `ai_usage_records`, and `ai_prompts`.

Migration to independently stored hierarchy entities requires measured evidence and a later expand/migrate/contract plan. Stable application-generated identifiers are still required for every editable nested entity.

### Resume upload controls — FINAL

Sprint 2 applies file-size limits, declared MIME validation, PDF signature validation, private handling, and prompt-injection boundaries. Malware scanning and long-term resume retention automation are deferred until pre-public-launch hardening. Resume upload remains independently feature-flagged.

### Review before persistence — FINAL

A generated candidate is schema- and semantically validated, then returned for review without creating a roadmap. The review includes detected proficiency, estimated duration, missing skills, weekly commitment, and AI confidence. The user may accept, regenerate, or edit inputs. Only acceptance creates roadmap, version, context, and generation records.

### Clarification policy — FINAL

At most one clarification may be asked. It is allowed only when the answer materially changes prerequisites, scope, duration, or level. Generation is preferred over interruption.

### Sprint 2 quality gate — FINAL

Sprint 2 requires deterministic JSON Schema tests, semantic validation tests, build verification, smoke tests, and one opt-in live OpenAI integration test. Failure injection, budget alerts, usage dashboards, queue restart testing, and the full evaluation suite remain required before public production rollout but are deferred from this sprint.

### Provider boundary and model configuration — FINAL

OpenAI is the only enabled Sprint 2 provider. Business logic depends on a generic provider contract and provider registry. Only the OpenAI adapter imports the OpenAI SDK. Model identifiers are supplied through the centralized `AI_MODEL_FAST`, `AI_MODEL_CORE`, and `AI_MODEL_ESCALATION` configuration profiles and never appear as source-code constants.

## Consequences

This amendment deliberately favors a smaller validation-oriented MVP. Synchronous requests have bounded timeouts and cannot resume after process failure. Embedded roadmaps require enforced size limits. These constraints are accepted for Sprint 2 and must be revisited before public scale.
