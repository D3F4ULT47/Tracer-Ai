# Plan 0003: Caching, request deduplication and a cheaper generation model

**Status:** Revision 2, Oct 16 2026. Approved by the owner ("proceed with this plan") with the section 9 recommendations.

**Implementation status (Oct 16):**

| Task               | State                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-02 to C-09, C-12 | Implemented and tested offline (`ai-reuse.test.js`, `ai-request-count.test.js`, section 6.1). Not yet run against real providers (section 6.2) or a real Redis server. |
| C-01               | Script written (`scripts/ai-duplicate-report.js`). The local database has no AI runs, so the duplicate rate is **not measured** yet.                                   |
| C-10               | Blocked: every AICredits call returns 402, so `prompt_cache_key` cannot be probed.                                                                                     |
| C-11               | Not done: Docker and Redis are not installed locally. Everything runs on the in-process fallback until `REDIS_ENABLED=true`.                                           |

Differences from revision 1: reuse is recorded on `ai_usage_records` (`reuseOutcome`, `sourceRunId`) rather than on `ai_runs`; the idempotency store keeps the full success response for 24 hours, scoped to the requester; the result cache also works in memory when Redis is off. Shared (`public`) source caching applies only when every source is GitHub, YouTube or a public Google Doc; the current client always sends the goal text as a source, so in practice its results stay private to the learner.
**Depends on:** RFC 0001 revision 3 (approved), Plan 0002 revision 3.
**Owner decisions needed:** listed in section 9.

## 1. The short version

Roadmap generation is the expensive call. With `openai/gpt-5.5` one roadmap costs about ₹39 (illustrative 6k input and 12k output tokens; section 7). This plan cuts that cost in three ways, in this order:

1. **Never pay twice for the same request.** A double-click, a retry after a network drop, or two open tabs must reuse the first run, not start a second one.
2. **Reuse results that are safe to reuse.** Preparation results for the same public source (one GitHub repository, one video) can be shared. Results for a person's own text stay private to that person.
3. **Use a cheaper generation model,** but only after it passes the same evaluation and human review as Plan 0002.

Every saving claimed after rollout must come from measurements in `ai_runs` and `ai_usage_records`. This plan contains estimates only.

## 2. What exists today

This is the setup in the repository at `f4b4d08` plus the uncommitted Plan 0002 work.

### 2.1 Redis and queues

| Piece                  | Where                                                     | State today                                                                                     |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Redis client (ioredis) | `server/src/infrastructure/redis/redis.js`                | Built, `lazyConnect`, health check in `/health`. Connects only when `REDIS_ENABLED=true`.       |
| `REDIS_ENABLED`        | `.env`, `.env.example`, `render.yaml`                     | `false` everywhere. Redis is not installed locally (`redis-cli` not found).                     |
| Redis rate-limit store | `server/src/modules/auth/middlewares/auth-rate-limits.js` | The only real Redis user. Auth routes only.                                                     |
| AI rate limit          | `server/src/modules/ai/ai-rate-limit.js`                  | In-memory store: 60 calls per hour signed in, 10 anonymous. Resets on restart, not shared.      |
| BullMQ queues          | `server/src/queues/queue-factory.js`                      | Six queue names defined (including `ai-runs`). No code adds jobs; only `closeQueues` is called. |
| Worker                 | `server/src/workers.js`                                   | Runs the outbox and account-deletion jobs from MongoDB. Does not read any BullMQ queue.         |

### 2.2 Request identity and hashing

| Piece                    | Where                                                                                                               | State today                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `inputHash` on `ai_runs` | `server/src/modules/ai/models/ai-run.model.js`                                                                      | Required and stored for every run. **Not indexed and never looked up**, so it cannot detect duplicates yet.                     |
| How each hash is made    | `roadmap-planning.service.js`, `preparation.service.js`, `source-understanding.service.js`, `assessment.service.js` | SHA-256 of `JSON.stringify` of the inputs. Key order is not normalised, and prompt, model and schema versions are not included. |
| Normalised text hash     | `server/src/modules/ai/input/text-normalizer.js`                                                                    | SHA-256 of normalised learner text. Stable, good base for a cache key.                                                          |
| Source content hash      | `server/src/modules/ai/source-understanding/source.handlers.js`                                                     | `contentHash` per source. Good base for a shared, public-source cache key.                                                      |
| Pipeline ID              | `server/src/modules/ai/accounting/pipeline-id.js`                                                                   | `x-tracer-pipeline-id` header, one per user action. Groups calls for accounting; not a deduplication key.                       |
| Idempotency key          | none                                                                                                                | **Missing.** ADR 0001 AI-5 requires one on generation endpoints ("duplicate keys return the original run").                     |

### 2.3 Generation request flow

| Piece                    | Where                                                        | State today                                                                                                           |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Endpoints                | `roadmap-planning.routes.js`                                 | `/prepare`, `/preview` (anonymous allowed), `/generate` (signed in), `/progress/:sessionId`.                          |
| Request style            | `roadmap-planning.controller.js`                             | Synchronous: the HTTP request stays open for the whole generation and returns 201. ADR AI-5 asks for 202 and polling. |
| Progress                 | `generation-progress.service.js`                             | In-memory `Map`, 15-minute lifetime. Works on one server process only.                                                |
| Preview to saved roadmap | `client/src/pages/RoadmapPreviewPage.jsx`                    | The preview is claimed with `anonymousSessionId`; it is **not** generated a second time. No duplicate cost here.      |
| Client retries           | `client/src/features/roadmaps/api/roadmap-generation-api.js` | No idempotency header. A retry or second click sends a fresh request, which pays again.                               |

### 2.4 Provider-side prompt caching

| Piece                   | State today                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cached-token accounting | Both providers read `cached_tokens` into `cachedInputTokens`, and `ai-cost.js` prices them.                                         |
| Request layout          | The prompt (instructions) comes first and the learner input last, which suits prefix caching.                                       |
| Cache hints             | No `prompt_cache_key` is sent. The Responses API call sets `store: false`. Whether AICredits passes cache hints through is unknown. |

### 2.5 What this means

- Redis is ready to use but switched off, and nothing AI-related uses it.
- Duplicate requests are paid in full today, because there is no idempotency key and no in-flight check.
- The hashes needed for caching already exist, but they are not stable enough to be cache keys yet (section 4.1).
- Progress and rate limits are per process. That is fine on one instance and breaks with two.

## 3. Rules for this plan

1. **Privacy first.** Resume-derived data never enters a shared cache (ADR 0001 and RFC 0001 D-1). Learner text is cached only under that learner's own key.
2. **Redis is an accelerator, not the source of truth.** Idempotency records live in MongoDB. If Redis is down, requests still work; they just lose the fast path.
3. **No stale roadmaps after a change.** Every cache key includes the prompt version, model ID and schema version, so a change to any of them misses the cache.
4. **Never discard roadmap data.** Caching never overwrites or regenerates an existing roadmap.
5. **Measure before claiming.** Report hit rates and money saved from recorded runs, not from this document.

## 4. Design

### 4.1 One stable fingerprint per AI call

Add `server/src/modules/ai/accounting/fingerprint.js`:

```text
fingerprint = SHA-256 of canonical JSON (keys sorted) of:
  operation, promptName, promptVersion, modelId, schemaVersion,
  dataClass, scope, input
```

- `scope` is `public` for shared public sources, or `owner:<userId>` / `anon:<anonymousSessionId>` for everything else.
- `input` is the existing normalised input (normalised text hash, source `contentHash` values, Learning Context).
- Store it as `ai_runs.fingerprint` with an index on `{ fingerprint, status, createdAt }`. Keep `inputHash` as it is for compatibility.

### 4.2 Layer 1: idempotency key (stops paid retries)

What the user sees: clicking Generate twice, or the browser retrying after a dropped connection, produces one roadmap and one charge.

- The client creates one `Idempotency-Key` (UUID) per user action and sends it on `/prepare`, `/preview` and `/generate`. A retry of the same action reuses the key; a new click on Generate after editing the input gets a new key.
- New collection `ai_idempotency_keys`: `{ key, ownerScope, endpoint, fingerprint, status, runId, roadmapId, response, createdAt, expiresAt }`, unique on `{ ownerScope, endpoint, key }`, TTL 24 hours.
- Behaviour:

| Situation                                 | Response                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| New key                                   | Insert record as `processing`, run normally, store the result reference, mark `completed`. |
| Same key, same fingerprint, finished      | Return the stored result with header `Idempotent-Replayed: true`. No AI call.              |
| Same key, same fingerprint, still running | Wait for the first run (section 4.3), then return its result.                              |
| Same key, different fingerprint           | `422 IDEMPOTENCY_KEY_REUSED`. The client made a mistake; nothing runs.                     |
| Same key, first run failed                | Allow a new attempt and replace the record; failures are not replayed.                     |

- Stored `response` holds IDs and the response envelope, not raw resume text. For `/generate` the roadmap is already in MongoDB, so only `roadmapId` and version are stored.

### 4.3 Layer 2: in-flight deduplication (stops parallel duplicates)

What the user sees: two tabs or two quick submits with the same input share one run.

- Before calling a provider, take a Redis lock: `SET ai:inflight:<fingerprint> <runId> NX PX <budget + 30s>`.
- If the lock exists, the second request waits for the first: it polls `ai:result:<fingerprint>` every 1 s up to the operation budget, then returns the same result. If the first run fails, the waiter gets the same error and may retry.
- The lock is released when the run finishes, fails or is cancelled. The expiry covers a crashed process.
- **Without Redis:** fall back to an in-process `Map` of pending promises (same behaviour on one instance). This is also how it runs locally until Redis is installed.
- Cancellation (Plan 0002 T-17) aborts the provider call only when no other request is waiting on it.

### 4.4 Layer 3: result cache (reuses safe results)

| What is cached                                                               | Scope                           | Key parts                                                      | TTL    | Why it is safe                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Source understanding of a public source (GitHub, YouTube, public Google Doc) | Shared (`public`)               | source `contentHash`, prompt, model, schema                    | 7 days | Public content; same input gives the same summary for everyone.                              |
| Learner assessment and combined preparation                                  | Owner or anonymous session only | normalised text hash plus source hashes, prompt, model, schema | 1 hour | Private to one learner; short TTL limits how long derived data sits in Redis.                |
| Anything with a resume or PDF upload                                         | Owner only, never shared        | as above                                                       | 1 hour | Required by D-1 and ADR 0001.                                                                |
| Roadmap generation                                                           | **Not cached**                  | —                                                              | —      | A learner who asks again usually wants a new roadmap. Idempotency covers accidental repeats. |

- Cache values are the validated JSON output plus the original `runId`. A hit records a new `ai_runs` entry with `cacheOutcome: 'hit'`, `sourceRunId`, and zero tokens and zero cost, so accounting stays complete.
- The server checks values against the JSON schema on read. A value that fails is deleted and treated as a miss.
- An owner's cache entries are deleted when the account is deleted (hook into `account-deletion.job.js`).

### 4.5 Layer 4: provider prompt caching (small, cheap win)

- Keep the stable prompt prefix first (already done) and add `prompt_cache_key: <operation>:<promptVersion>` only after a probe shows AICredits accepts it without errors.
- Honest size of this win: on gpt-5.5, caching all 6k input tokens saves at most about ₹2.70 of ₹39 per roadmap (about 7%), because output tokens dominate. Worth doing, not worth delaying the other layers for.

### 4.6 Shared state that should move to Redis at the same time

- Progress (`generation-progress.service.js`): store snapshots in Redis with the same 15-minute TTL, keep the `Map` as the fallback.
- AI rate limit (`ai-rate-limit.js`): reuse the existing `RedisRateLimitStore` pattern from the auth limits.

These are needed before running more than one API instance; they do not save money directly.

## 5. Tasks

| ID   | Task                                                                                                             | Files                                                         | Needs Redis |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| C-01 | Measure today's duplicate rate: count `ai_runs` sharing an `inputHash` within 10 minutes, per operation          | `scripts/ai-duplicate-report.js`                              | No          |
| C-02 | Canonical fingerprint helper and `ai_runs.fingerprint`, `cacheOutcome`, `sourceRunId` fields with index          | `accounting/fingerprint.js`, `ai-run.model.js`                | No          |
| C-03 | Idempotency collection, middleware and replay logic for `/prepare`, `/preview`, `/generate`                      | `infrastructure/idempotency/*`, `roadmap-planning.routes.js`  | No          |
| C-04 | Client sends one `Idempotency-Key` per user action and reuses it on retry                                        | `roadmap-generation-api.js`, `HomePage.jsx`                   | No          |
| C-05 | In-flight deduplication with in-process fallback                                                                 | `infrastructure/dedup/single-flight.js`, the four AI services | Optional    |
| C-06 | Cache service (get, set, schema check on read, owner purge)                                                      | `infrastructure/cache/ai-result-cache.js`                     | Yes         |
| C-07 | Wire the cache into source understanding (public) and preparation (owner scope)                                  | `source-understanding.service.js`, `preparation.service.js`   | Yes         |
| C-08 | Purge an owner's cache entries on account deletion                                                               | `jobs/account-deletion.job.js`                                | Yes         |
| C-09 | Move progress and AI rate limit to Redis with in-memory fallback                                                 | `generation-progress.service.js`, `ai-rate-limit.js`          | Yes         |
| C-10 | Probe `prompt_cache_key` on AICredits with synthetic input; add it only if accepted                              | `scripts/ai-provider-probe.js`, both providers                | No          |
| C-11 | Local Redis for development (Docker compose service or Homebrew note) and `REDIS_ENABLED=true` in `.env.example` | `docker-compose.yml` or `docs/`                               | Yes         |
| C-12 | Report: hits, misses, replays, deduplicated waits, and rupees not spent, from recorded runs                      | `scripts/ai-usage-report.js` (Plan 0002 T-08)                 | No          |

Suggested order: C-01 first (it tells us how big the problem is), then C-02 to C-05 (no Redis needed), then C-11, C-06 to C-09, then C-10 and C-12.

## 6. Tests

| ID      | Checks that                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------- |
| AT-C-1  | Two requests with the same key and input make one provider call and return the same `roadmapId`.    |
| AT-C-2  | Same key with different input returns 422 and makes no provider call.                               |
| AT-C-3  | Two parallel requests with the same fingerprint and different keys make one provider call.          |
| AT-C-4  | A resume-derived result is never written under the `public` scope (unit test on the cache service). |
| AT-C-5  | Changing the prompt version, model or schema version misses the cache.                              |
| AT-C-6  | With Redis stopped, generation still succeeds and idempotency still works from MongoDB.             |
| AT-C-7  | A corrupted cache value is rejected by the schema check and the call runs normally.                 |
| AT-C-8  | Deleting an account removes its cache entries.                                                      |
| AT-C-9  | A cache hit records an `ai_runs` entry with `cacheOutcome: 'hit'` and zero cost.                    |
| AT-C-10 | Cancelling one of two deduplicated requests does not abort the shared provider call.                |

### 6.1 Request-count tests (no credits needed)

`server/test/ai-request-count.test.js` sends real HTTP requests through the real idempotency middleware, reuse layer and scope rules, with a provider stub that counts calls. Several learners are simulated with separate anonymous session IDs. `server/test/preparation.test.js` adds the same counts per preparation case (prompt only, prompt with public sources, prompt with resume, and the assessment).

| Scenario                           | Provider calls expected |
| ---------------------------------- | ----------------------- |
| First roadmap for a learner        | 3                       |
| Network retry with the same key    | 0 (replayed)            |
| Same learner asks again            | 1 (generation only)     |
| Two tabs at the same moment        | 1 shared call           |
| Three learners, same goal          | 9 (nothing shared)      |
| Three learners, public-only source | 1 understanding call    |
| Resume next to public sources      | never shared            |
| Same key, different body           | 0 (rejected with 422)   |

These tests found one real bug, now fixed: source understanding and the combined preparation call never hit the cache, because each request carries a new random `sourceId` and `capturedAt`. The fingerprint now ignores those fields, and a cached result has its source IDs rewritten to the current request's IDs.

### 6.2 Live check (spends credit)

`scripts/ai-reuse-live-check.js` runs these scenarios on the routed flow (`/ai/roadmaps/prepare`; the legacy endpoints are never called) against the running API and real providers, and counts what actually happened from `ai_usage_records`. Before running it, enable `ai-routed-preparation` and `ai-learner-assessment` in `FEATURE_FLAGS`, set `AI_RATE_LIMIT_ANONYMOUS_PER_HOUR` to at least 10, and restart the API.

The default run makes one provider call (a case 4 learner assessment). `--with-other-learner`, `--with-shared` and `--with-generation` each add one call.

**Result, Oct 18** (`AI_MODEL_FAST=aicredits:openai/gpt-5.5`, default run): 3 of 3 checks passed. The first preparation routed to case 4 and made one call (1,002 input and 866 output tokens, 8.9 s, ₹3.09). A retry with the same key was replayed with no new record. A repeat by the same learner with a new key was a cache hit: 0 tokens, ₹0, 4 ms. The other-learner, simultaneous-request and generation checks have not been run live.

## 7. Cheaper generation model

### 7.1 Candidates (AICredits catalog, Oct 16 2026)

Illustrative cost uses 6k input and 12k output tokens per roadmap. Reasoning tokens are billed as output and vary by model, so real costs will differ.

| Model                         | Input ₹ / 1M | Output ₹ / 1M | Illustrative ₹ per roadmap | API       | Notes                                                   |
| ----------------------------- | ------------ | ------------- | -------------------------- | --------- | ------------------------------------------------------- |
| `openai/gpt-5.5` (current)    | 499.28       | 2,995.65      | 38.94                      | Responses | Baseline                                                |
| `openai/gpt-5.4`              | 249.64       | 1,497.83      | 19.47                      | Responses | No adapter change needed                                |
| `openai/gpt-6-sol`            | 199.71       | 998.55        | 13.18                      | Chat only | Uses the `aicredits-chat` provider                      |
| `anthropic/claude-sonnet-5.5` | 199.71       | 998.55        | 13.18                      | Chat      | Structured output support needs a probe                 |
| `google/gemini-2.5-pro`       | 124.82       | 998.55        | 12.73                      | Chat      | Structured output support needs a probe                 |
| `deepseek/deepseek-v4-pro`    | 131.81       | 395.43        | 5.54                       | Chat      | Cheapest strong candidate; data-handling terms to check |

### 7.2 How a candidate is chosen

1. Probe structured output with synthetic input (no learner data).
2. Run the Plan 0002 fixtures F1 to F9 on the baseline and up to three candidates.
3. Human review R1 for each candidate, same criteria C1 to C8.
4. Pick the cheapest candidate with no unacceptable fixture and coverage at least equal to the baseline. Record it in `evaluation/routing/model-eligibility.json`.
5. Switch `AI_MODEL_CORE`, keep gpt-5.5 as the first fallback for two weeks, compare real cost and failure rate from `ai_usage_records`.

Note: AICredits returns 402 on every call today, so steps 1 to 3 need account credit first.

## 8. Expected effect (estimates, not measurements)

| Layer           | Saves on a hit                         | How often it hits                       | Latency effect                                |
| --------------- | -------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Idempotency     | 100% of a repeated call                | Unknown; C-01 measures it               | Replay returns in milliseconds                |
| In-flight dedup | 100% of a parallel call                | Unknown; C-01 measures it               | Waiter finishes when the first run finishes   |
| Result cache    | 100% of a preparation call             | Depends on repeat public sources        | Cached preparation skips 5–60 s of model time |
| Prompt caching  | Up to ~7% per gpt-5.5 call             | Every call, if the provider supports it | Small, provider-dependent                     |
| Cheaper model   | 50–86% per roadmap (from prices above) | Every roadmap                           | Unknown until measured                        |

The cheaper model is the largest single lever. Caching and deduplication protect against waste and make cost predictable.

## 9. Decisions for the owner

| ID  | Question                                                                      | Recommendation                                                       |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Q-1 | Turn Redis on for local development and production now?                       | Yes, after C-01 to C-05 land; those work without Redis.              |
| Q-2 | Owner-scoped cache TTL for private preparation results                        | 1 hour.                                                              |
| Q-3 | Should a learner who asks for the same roadmap again get the cached one?      | No. Only accidental repeats (same idempotency key) are reused.       |
| Q-4 | Move `/generate` to 202 plus polling as ADR AI-5 says, in this plan or later? | Later. Idempotency and dedup work with the current synchronous flow. |
| Q-5 | Which candidates to evaluate first?                                           | `openai/gpt-5.4`, `openai/gpt-6-sol`, `deepseek/deepseek-v4-pro`.    |

## 10. Rollback

- Each layer has its own flag: `AI_IDEMPOTENCY_ENABLED`, `AI_DEDUP_ENABLED`, `AI_RESULT_CACHE_ENABLED`. Turning a flag off restores today's behaviour.
- `REDIS_ENABLED=false` disables the cache and falls back to in-process deduplication; nothing else breaks.
- New collections and fields are additive; no existing data is changed or removed.
