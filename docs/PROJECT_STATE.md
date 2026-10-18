# Tracer AI — Project state after the cost-reduction work

**As of:** Oct 17 2026. **Starting point:** commit `04e203d` ("v.01 Deployment ready", Aug 9 2026). **Latest pushed commit:** `9956b85` on `main`. **Uncommitted:** 13 files (the request-count tests and the live check, section 6.4).

This document compares four things for every area the work touched: what the project did before, what was planned, what exists now, and what it was meant to achieve. Every status is checked against the code, not only against the plan documents. Nothing here is a measured cost or latency result; none has been possible, because every AICredits call returns 402 (insufficient balance).

> **Update, Oct 18.** Corrections to this document:
>
> - The preparation limits (D-2, D-7, D-8) were not wired into the model chains before Oct 17, and the D-3 fail policy was not enforced. Both are now done and tested.
> - The legacy endpoints run on `AI_MODEL_CORE` (gpt-5.5). The `.env` setting for preparation affects only the new `/prepare` flow.
> - Local `.env` now enables `ai-routed-preparation` and `ai-learner-assessment`, sets the anonymous AI limit to 50 per hour and points `AI_MODEL_FAST` at the free-first chain.
> - AICredits now has credit (₹49), so the 402 note below no longer applies.
>
> The first evaluation ran on Oct 17–18 and approved no model. It also found and fixed a defect: AICredits rejected every chat-adapter schema. Results and spend are in Plan 0002 section 8.5.

## 1. The short version

- **The goal** was to cut AI cost and latency per roadmap without lowering quality: fewer calls, free models for preparation, paid models only for the final roadmap, and no paying twice for the same work.
- **Built and tested offline:** the four-case router, free-then-paid model chains with a privacy gate, per-attempt cost accounting, the `/prepare` endpoint, retry and time limits, free-quota handling, and the whole caching, idempotency and deduplication layer.
- **Not reachable by users yet.** The browser still calls the old three endpoints, the `ai-routed-preparation` flag is off, `.env` points preparation at gpt-5.5, and no free model is approved for production. A roadmap made in the app today still makes **3 paid gpt-5.5 calls**. What does work today is reuse: a retried, double-clicked or repeated request no longer pays again.
- **Not done:** prompt 2.0.0 with requirement coverage and repair, the client switch to `/prepare`, the evaluation fixtures, the usage and cost report, and every measurement that needs credit.
- **Saving claimed:** none. Savings can only be shown after the legacy baseline and the side-by-side comparison run.

## 2. What this chat did, in order

| #   | Your request                                                                         | Outcome                                                                                                                   |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Run the project locally; provide keys                                                | Client, API, worker and MongoDB running locally. Keys were placed in `.env` (not committed)                               |
| 2   | Explain the architecture, data, schemas, aggregations and cost before caching        | Architecture and cost review (Cursor canvas `tracer-ai-architecture-and-cost-review`)                                     |
| 3   | Are source understanding and assessment called even when there is nothing to assess? | Yes: all 3 calls ran on every roadmap, and empty calls still cost tokens                                                  |
| 4   | Redesign the AI pipeline (model routing, cost, combined preparation)                 | RFC 0001 written, reviewed twice, revision 3 approved                                                                     |
| 5   | Implement RFC 0001                                                                   | Steps 1, 2, 4, 5, 6 and 7 built; steps 3, 8, 9 and 10 not done (section 4.1)                                              |
| 6   | Audit how each request type is handled now versus before                             | Request routing audit (Cursor canvas `tracer-ai-request-routing-audit`)                                                   |
| 7   | Only roadmap generation may use AICredits; preparation on free models                | Plan 0002 written; conflict with the resume privacy rule raised and decided (D-1)                                         |
| 8   | No degraded mode; one paid fallback call instead                                     | Recorded in Plan 0002; final decisions D-2 and D-3                                                                        |
| 9   | Review Plan 0002 against RFC 0001; cost and latency as the source of truth           | Plan 0002 revision 3, with the main goal restored                                                                         |
| 10  | Implement Plan 0002; find cheaper generation models; plan Redis and deduplication    | Phase 0 and most of phase 1 built (section 4.2); price table of cheaper models; Plan 0003 written                         |
| 11  | Fix the CI failure and the reported bugs                                             | Fixed the real failures; the reported "bugs" were checked and were intended behaviour                                     |
| 12  | Implement Plan 0003                                                                  | Built, reviewed by Bugbot, the one real finding fixed, pushed (`b4b83c9`, `c5d40d6`, `9956b85`)                           |
| 13  | Request-count and caching tests across several users                                 | 10 HTTP scenarios and per-case counts written and passing; they found and fixed a cache-miss bug; live check script added |

## 3. Master matrix

"Before" is commit `04e203d`. "Verified" says how the current state is known.

| Area                         | Before                                                        | Planned                                                                                                             | Now                                                                                                                                                   | Meant to achieve                           | Verified                                   |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Calls per roadmap            | 3, always (source understanding, assessment, generation)      | 1 (goal only) or 2 (one preparation call plus generation), RFC 0001 section 4.4                                     | Router built behind `/prepare`; the browser still makes 3 calls                                                                                       | Fewer calls, lower latency                 | Unit and HTTP tests; not live              |
| Models used                  | gpt-5.5 for every call                                        | Free OpenRouter models for preparation; gpt-oss-120b, then gpt-5-mini as paid fallback; gpt-5.5 only for generation | Chains, fallback order and gpt-5.5 exclusion from preparation built. `.env` still sets `AI_MODEL_FAST=openai/gpt-5.5`                                 | Pay only for generation                    | Unit tests; config not aligned             |
| Free model approval          | Not applicable                                                | Each model approved per operation after evaluation and human review                                                 | Only gpt-5.5 has a record (`legacy_baseline`). No free model is approved, so production drops them                                                    | Safe quality before switching              | Read from `model-eligibility.json`         |
| Resume privacy               | Resumes went to gpt-5.5 on AICredits                          | Resumes never reach free endpoints (D-1)                                                                            | Enforced on every attempt, retry and fallback                                                                                                         | No personal data on free providers         | Outbound-host tests                        |
| Combined preparation         | None                                                          | One call when both sources and learner evidence need analysis                                                       | Built (`preparation-combined/1.0.0`, combined schema)                                                                                                 | One call instead of two                    | Unit tests                                 |
| Preparation failure          | Request failed                                                | D-3: fail with 502, no degraded generation                                                                          | Built, default `fail`; `degraded` available as a switch                                                                                               | No roadmap from bad input                  | Unit tests                                 |
| Free quota exhausted         | Not applicable                                                | D-7: reject with 503; client shows "Server down"                                                                    | Daily 429 detection and reject policy built                                                                                                           | No surprise paid spend                     | Unit tests                                 |
| Paid preparation cap         | None                                                          | D-2: at most 2 paid preparation attempts                                                                            | Built (`AI_PAID_PREPARATION_LIMIT=2`)                                                                                                                 | Bounded worst-case cost                    | Unit tests                                 |
| Retries and reasoning        | SDK retried silently twice; no reasoning default              | 2 retries and `low` effort for preparation; 1 retry and `medium` for generation                                     | Code defaults set; effort is sent only when the model's catalog says it is supported                                                                  | No hidden extra spend                      | Unit tests                                 |
| Time limits                  | 120 s per call                                                | 60 s free budget, 30 s per attempt, 90 s paid budget                                                                | Built. A browser disconnect does not yet cancel the provider call                                                                                     | Bounded latency                            | Unit tests                                 |
| Cost accounting              | Tokens only; failed calls recorded as 0; no pipeline grouping | Per-attempt records, INR cost, pipeline ID, cost per successful roadmap                                             | Per-attempt records with prices, host, attempt kind and reuse outcome; pipeline ID; failed-call tokens counted. Fallback reason and effort not stored | Measure real cost                          | 12 cost tests; no live data                |
| Requirement coverage         | None                                                          | Prompt 2.0.0, coverage check, one repair call                                                                       | Not built                                                                                                                                             | Quality not lowered                        | —                                          |
| Client                       | Calls source understanding, assessment, generation            | One `/prepare` call; show source statuses                                                                           | Still the 3 old calls; sends pipeline ID and idempotency key, retries once on connection loss                                                         | One request from the browser               | Client tests                               |
| Retries and double-clicks    | Paid in full every time                                       | Idempotency key per user action, 24 h replay                                                                        | Built on 5 AI endpoints, stored in MongoDB                                                                                                            | Never pay twice for one action             | Unit and HTTP tests                        |
| Identical requests in flight | Each paid separately                                          | Share one provider call                                                                                             | Built in process; across servers when Redis is on                                                                                                     | Two tabs pay once                          | HTTP tests; Redis path only with stand-ins |
| Result cache                 | `inputHash` stored, never read                                | Public sources shared 7 days; learner's own results 1 h; roadmaps never cached                                      | Built, with schema check on read and source-ID rebinding                                                                                              | Repeats cost nothing                       | HTTP and per-case tests                    |
| Redis                        | Built but off; only sign-in rate limits used it               | Shared cache, locks, progress and AI rate limit                                                                     | Code ready; `REDIS_ENABLED=false`; Redis not installed locally                                                                                        | Multiple API servers                       | Stand-ins only                             |
| Rate limits                  | AI: 60 per hour signed in, 10 anonymous, fixed in code        | Configurable and shared                                                                                             | `AI_RATE_LIMIT_USER_PER_HOUR`, `AI_RATE_LIMIT_ANONYMOUS_PER_HOUR`; fail-open on Redis errors                                                          | Testing and scaling                        | Suite passes                               |
| Account deletion             | Deleted learner data                                          | Also purge cached AI results and idempotency records                                                                | Built                                                                                                                                                 | Privacy                                    | Unit test                                  |
| Provider prompt caching      | Cached tokens counted; no hint sent                           | Send `prompt_cache_key` if AICredits accepts it                                                                     | Not built; probe blocked by 402                                                                                                                       | Up to about 7% per gpt-5.5 call (estimate) | —                                          |
| Cheaper generation model     | gpt-5.5, about ₹39 per roadmap (illustrative)                 | Evaluate gpt-5.4, gpt-6-sol, deepseek-v4-pro and others                                                             | Prices compared only (Plan 0003 section 7)                                                                                                            | Largest single saving                      | Catalog prices; quality not tested         |
| Measurements                 | None                                                          | Legacy baseline, then legacy-versus-routed comparison                                                               | None. Probe: Nemotron free gave valid JSON twice (5.1 s, 6.7 s); every AICredits call 402                                                             | Prove savings                              | —                                          |

## 4. Status of every planned task

### 4.1 RFC 0001 (approved, revision 3)

| Step | Work                                                | Status                                                                     |
| ---- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| 1    | Probe calls per adapter                             | Partial: probe script works; free model passed; paid models blocked by 402 |
| 2    | Accounting                                          | Done, except per-stage latency                                             |
| 3    | One-fixture legacy baseline                         | Blocked by credit                                                          |
| 4    | Chat Completions adapter, model chain, privacy gate | Done                                                                       |
| 5    | Router and per-case tests                           | Done                                                                       |
| 6    | Learning context without an assessment              | Done                                                                       |
| 7    | `/prepare` behind `ai-routed-preparation` (off)     | Done; reusing an earlier understanding over HTTP is not exposed            |
| 8    | Prompt 2.0.0, requirement coverage, repair          | Not started                                                                |
| 9    | Client calls `/prepare`                             | Not started                                                                |
| 10   | Model evaluation, legacy-versus-routed comparison   | Not started; needs credit                                                  |

### 4.2 Plan 0002 (free preparation, paid generation)

The plan document still says "revision 3, not approved". Decisions D-1, D-2, D-3, D-7 and D-12 were recorded on Oct 16, and the code follows them.

| Task | Work                                                 | Status                                                                          |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| T-01 | Commit and tag `rfc0001-baseline`                    | Done (`f4b4d08`)                                                                |
| T-02 | Reasoning-effort defaults                            | Done                                                                            |
| T-03 | Retry defaults                                       | Done                                                                            |
| T-04 | Probe files for every chain entry                    | Not done; probe results exist only in chat                                      |
| T-05 | RFC step 8 (prompt 2.0.0, coverage, repair)          | Not done                                                                        |
| T-06 | RFC step 9 (client `/prepare`)                       | Not done                                                                        |
| T-07 | Nine fixtures, evaluation script, review template    | Not done                                                                        |
| T-08 | Usage and cost report                                | Not done (`ai-duplicate-report.js` covers reuse only)                           |
| T-09 | Legacy baseline                                      | Blocked by credit                                                               |
| T-10 | Legacy-versus-routed comparison                      | Blocked by credit, and by T-05 and T-06                                         |
| T-11 | Set `AI_MODEL_FAST` to the RFC chain in `.env`       | Not done (yours to change)                                                      |
| T-12 | Full regression run                                  | Passing: 227 of 229 server tests (2 live tests skipped), 34 client tests        |
| T-13 | Accounting fixes per attempt                         | Partial: fallback reason and reasoning effort are not stored on usage records   |
| T-14 | Operation policy; gpt-5.5 baseline limited to legacy | Done                                                                            |
| T-15 | Paid preparation cap                                 | Done                                                                            |
| T-16 | More free models, each with an eligibility record    | Not done; Apodex free left the OpenRouter catalog on Oct 16                     |
| T-17 | Time budgets, abort signals, cancel on disconnect    | Partial: budgets and timeouts done; disconnect not wired                        |
| T-18 | Quota detection and reject policy                    | Partial: daily 429 detection and reject done; no cached `GET /api/v1/key` check |
| T-19 | Catalog snapshot, recheck, circuit breaker           | Partial: circuit breaker and snapshot methods done; no hourly recheck           |
| T-20 | Preparation failure policy switch                    | Done (default `fail`); half-redo of a combined call not built                   |
| T-21 | Switch to allow resumes on free models               | Not needed under D-1                                                            |
| T-22 | Resumable evaluation with quota reserve              | Not done                                                                        |
| T-23 | Turn routed preparation on in production             | Not started; release gates RG-1 to RG-9 all unmet                               |
| T-24 | Remove the legacy pipeline                           | Not started (kept per D-4, D-5)                                                 |

### 4.3 Plan 0003 (caching and request deduplication, approved)

| Task | Work                                               | Status                                                       |
| ---- | -------------------------------------------------- | ------------------------------------------------------------ |
| C-01 | Measure today's duplicate rate                     | Script written; not measured (local database has no AI runs) |
| C-02 | Fingerprint and reuse fields                       | Done                                                         |
| C-03 | Idempotency keys on AI endpoints                   | Done (5 endpoints)                                           |
| C-04 | Client key per action, reused on retry             | Done                                                         |
| C-05 | In-flight deduplication                            | Done                                                         |
| C-06 | Result cache                                       | Done                                                         |
| C-07 | Cache wired into source understanding, preparation | Done, plus assessment                                        |
| C-08 | Purge on account deletion                          | Done                                                         |
| C-09 | Progress and AI rate limit on Redis                | Done, with in-memory fallback                                |
| C-10 | Provider prompt-cache hint                         | Blocked by credit                                            |
| C-11 | Local Redis for development                        | Not done (no Docker; Homebrew install left to you)           |
| C-12 | Reuse report                                       | Done inside `ai-duplicate-report.js`                         |

## 5. Calls per roadmap: before and now

Derived from the code and the offline tests. These are call counts, not measured costs.

| Situation                                   | Before (`04e203d`) | Today in the app                  | After the client switch, flag on and `.env` aligned |
| ------------------------------------------- | ------------------ | --------------------------------- | --------------------------------------------------- |
| Goal only                                   | 3 paid             | 3 paid                            | 1 paid                                              |
| Goal with public links or a PDF             | 3 paid             | 3 paid                            | 1 free, 1 paid                                      |
| Goal with sources and a resume              | 3 paid             | 3 paid                            | 1 cheap paid (combined), 1 paid                     |
| Resume or self-description only             | 3 paid             | 3 paid                            | 1 free (cheap paid with a resume), 1 paid           |
| Network retry or double-click (same action) | 3 more paid        | 0 (replayed)                      | 0                                                   |
| Same learner, same input, within 1 hour     | 3 more paid        | 1 paid (generation only)          | 1 paid                                              |
| Two tabs at the same moment                 | 6 paid             | 3 paid (shared)                   | as a single request                                 |
| Different learners, public-only sources     | 3 paid each        | source understanding once for all | understanding once for all                          |

The last column also needs approved free models (T-07, T-16 and the evaluation); without them, production drops free entries and uses the paid fallbacks.

## 6. Every change made

### 6.1 Commits

| Commit    | Content                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `f4b4d08` | RFC 0001 implementation (steps 1, 2, 4–7) and Plan 0002 revision 3; tagged `rfc0001-baseline`              |
| `0422981` | Plan 0002 phase 0 and phase 1 code: defaults, budgets, quota, circuit breaker, operation policy, paid cap  |
| `b4b83c9` | Plan 0003: reuse layer, idempotency, deduplication, Redis-backed progress and rate limit, client keys      |
| `c5d40d6` | Bugbot fix: idempotency settles on the server's response, not on connection close; stale records reclaimed |
| `9956b85` | Clarification idempotency test and remaining Plan 0003 changes                                             |
| (pending) | Configurable AI rate limits, source-ID rebinding fix, request-count tests, live check script               |

Across the chat, 76 files changed (35 added, 41 modified), about 7,500 lines added.

### 6.2 New server code

- **Preparation:** `preparation-router.js` (four cases without a model call), `preparation.service.js`, `preparation.controller.js`, `combined-preparation.schema.js`, `source-context.js`; prompts `preparation-combined/1.0.0` and `source-understanding/1.1.0` (adds `requirements[]`).
- **Providers:** `chat-completions.provider.js` (AICredits and OpenRouter), `model-chain.js` (fallback, privacy gate, operation policy, paid cap, budgets), `model-eligibility.js`, `availability.js` (circuit breaker, free-quota tracker), `provider-support.js` (own retries, error mapping).
- **Accounting:** `ai-cost.js`, `pipeline-id.js`, `usage-records.js`, `fingerprint.js`.
- **Reuse:** `reuse/reusable-provider.js`, `reuse/idempotency.js`, `reuse/reuse-scope.js`, `reuse/purge.js`, `infrastructure/cache/ai-result-store.js`, `infrastructure/redis/redis-rate-limit-store.js`, model `ai-idempotency-key.model.js`.

### 6.3 Changed server and client code

- Source understanding, assessment, learning context, roadmap planning and generation progress services, their controllers and routes.
- Usage-record and run models (attempt fields, prices, reuse outcome, indexes); roadmap context model (preparation decision, source statuses).
- `env.js`, `ai.config.js`, `.env.example`; account-deletion job; worker Redis connection; shared contracts and schemas.
- Client `roadmap-generation-api.js` and `HomePage.jsx`: pipeline ID, idempotency key, one retry on connection loss.

### 6.4 Scripts, migrations, tests and documents

- **Scripts:** `ai-provider-probe.js`, `ai-duplicate-report.js`, `ai-reuse-live-check.js` (pending commit, not yet run), migration `004-create-ai-reuse-indexes.js`.
- **Tests added:** `ai-cost`, `model-chain-privacy`, `preparation-router`, `preparation` (including per-case request counts), `ai-reuse`, `ai-request-count` (10 multi-learner scenarios), client generation API tests, progress across instances.
- **Documents:** RFC 0001, Plan 0002, Plan 0003, `model-eligibility.json`, this document. Two Cursor canvases: the architecture and cost review and the request routing audit.

## 7. Settings and actions only you can do

| Item                    | Current value    | Needed for                                   | Change to                                                         |
| ----------------------- | ---------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Exposed credentials     | Pasted in chat   | Security                                     | Rotate AICredits, OpenRouter, Cloudinary, YouTube and GitHub keys |
| AICredits balance       | Empty (402)      | Every measurement, paid fallback, generation | Top up                                                            |
| `FEATURE_FLAGS`         | `{}`             | Assessment and generation work at all        | `{"ai-learner-assessment":true,"ai-roadmap-generation":true}`     |
| `AI_MODEL_FAST`         | `openai/gpt-5.5` | Cheap preparation                            | The RFC chain (free model, then gpt-oss-120b, then gpt-5-mini)    |
| `ai-routed-preparation` | Off              | Routed pipeline                              | Only after the release gates pass                                 |
| `REDIS_ENABLED`         | `false`          | Several API servers                          | `true` once Redis runs (`brew install redis` locally)             |
| Anonymous AI rate limit | 10 per hour      | Live testing                                 | `AI_RATE_LIMIT_ANONYMOUS_PER_HOUR=50` while testing               |

## 8. Suggested order for what comes next

1. Rotate the exposed keys, top up AICredits, set `FEATURE_FLAGS`.
2. Run the live reuse check (`node scripts/ai-reuse-live-check.js --skip-generation`, then without the flag).
3. Run the legacy baseline (T-09) with the T-08 usage report, so there is a measured cost per roadmap.
4. Build prompt 2.0.0 with coverage and repair (T-05), then the client switch to `/prepare` (T-06).
5. Fixtures and the free-model evaluation with human review (T-07, T-22), which produce the eligibility records (T-16).
6. Legacy-versus-routed comparison (T-10); turn the flag on only if every release gate passes (T-23).
7. Evaluate a cheaper generation model the same way; it is the biggest remaining saving.
8. Smaller gaps: store fallback reason and effort (T-13), cancel on disconnect (T-17), quota pre-check (T-18), catalog recheck (T-19), local Redis (C-11), prompt-cache probe (C-10).
9. Bring the status lines of RFC 0001 and Plan 0002 up to date; both still describe Oct 12–14.
