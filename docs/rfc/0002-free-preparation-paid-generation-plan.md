# Implementation plan 0002 — Free-model preparation, paid-model generation

- **Status:** Revision 3, **not approved**. Nothing proposed only by this plan is authorized or implemented. No release gate in this document is met.
- **Date:** 2026-10-14
- **Approved baseline:** RFC 0001 revision 3 (`docs/rfc/0001-conditional-ai-preparation-and-model-routing.md`). It is the source of truth for every previously approved decision. Where this plan conflicts with it, the conflict is listed in section 4 and resolved by an explicit decision in section 7. Until a decision is recorded, RFC 0001 behaviour stays in force.
- **Revision history:** revision 1 (Oct 12) recorded owner answers Q1–Q6; the Q7 amendment replaced degraded preparation; revision 2 (Oct 12) answered the external 10-point review; revision 3 (this one) reconciles all of it against RFC 0001.

## 1. Rules for this revision

1. **RFC 0001 defaults stay the defaults.** A proposed behaviour that conflicts with RFC 0001 is built, if at all, as a switch whose default is the RFC 0001 behaviour. Changing the default requires the decision listed for it in section 7.
2. **Owner answers given in chat are directions, not approvals.** Q1–Q7 (Oct 12) are recorded as the owner's stated direction. Where they reverse an RFC 0001 decision, they need explicit re-confirmation as part of approving this revision.
3. **The four-case router is not changed.** `decidePreparation` (RFC 0001 section 4, `preparation-router.js`) decides the case without a model call and stays as implemented. Every change in this plan concerns what happens _after_ the router: model choice, fallback, privacy, quota, failure handling, evaluation and recovery.
4. **No claims without measurements.** No cost saving, latency improvement, quality parity or end-to-end success is claimed. Every figure below is either measured (and says so), derived from code, or labelled illustrative.
5. **Cost and latency decide between valid options.** The main goal below is the objective of this plan. RFC 0001 decisions and the quality gates are its constraints. Every open decision states its cost and latency effect (section 7.1), and recommendations favour the cheapest and fastest option that meets the quality gates and the privacy rule in force.

## 2. Goals

**Main goal (source of truth for this plan):** generate every roadmap at the lowest possible cost and latency without lowering its quality. Success is shown only by measurements from section 8.3: cost per successful roadmap and end-to-end latency p50 and p95, compared with the legacy pipeline on the same fixtures.

| Goal                                       | Definition                                                                                                                                                                                                       | Depends on    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **G1 — Paid models for generation**        | Source understanding and learner assessment run on free models first. Paid preparation runs only as a fallback, on the cheap RFC 0001 fallback models, never on the generation model. Generation stays on `core` | D-1, D-2, D-3 |
| **G2 — The fewest requests**               | 0 preparation calls in case 1 and 1 in cases 2–4 when the first model succeeds (RFC 0001 section 4.4); one client `/prepare` request; bounded retries and time                                                   | D-8           |
| **G3 — Quality not lowered, and shown so** | RFC 0001 thresholds, the human review (section 6.2), the legacy-versus-routed comparison and requirement coverage with one repair                                                                                | D-6           |

**Conflict inside the goals:** under the approved privacy gate (RFC 0001 section 5.2, Q8), resume requests in cases 3 and 4 must use paid preparation models. G1 as the owner stated it ("no source understanding or learner assessment on paid models") cannot hold for resume requests unless D-1 changes that gate. This revision does not resolve that silently; see D-1.

## 3. Baseline: what RFC 0001 authorized, and what exists

### 3.1 RFC 0001 implementation steps

| Step (RFC 0001 section 10)                                  | State on Oct 14 2026 (all uncommitted on top of `04e203d`)                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Probe calls per adapter                                  | **Partial.** Nemotron free returned schema-valid output twice (5.1 s, 6.7 s); results exist only in chat. Every AICredits call returned 402 |
| 2. Accounting                                               | Implemented (pipeline ID, attempt records, cost function, 12 tests). Gaps in section 4, change 18                                           |
| 3. One-fixture legacy baseline                              | **Not done.** Blocked: AICredits returns 402 Insufficient Balance                                                                           |
| 4. Chat Completions adapter, model chain, privacy gate      | Implemented, including outbound-host tests (`model-chain-privacy.test.js`)                                                                  |
| 5. Router and per-case tests                                | Implemented, 10 tests                                                                                                                       |
| 6. Learning context without an assessment                   | Implemented                                                                                                                                 |
| 7. `/prepare` behind `ai-routed-preparation` (default off)  | Implemented, 11 tests. With the flag off, `/prepare` runs the legacy pipeline server-side                                                   |
| 8. Prompt 2.0.0, schemas, coverage and repair               | **Not done**                                                                                                                                |
| 9. Client changes                                           | **Not done.** The client still calls `/ai/source-understanding` and `/ai/assessments`; it only sends a pipeline ID header                   |
| 10. Preparation model evaluation, then legacy-versus-routed | **Not done**                                                                                                                                |

Test suite on Oct 12: 190 pass, 0 fail, 2 skipped (live tests). Lint and the architecture check pass.

Steps 1, 3, 8, 9 and 10 remain **authorized by RFC 0001** and are scheduled in phase 0 (section 10), in their RFC 0001 form.

### 3.2 Conformance gaps against RFC 0001 found in this revision

| Gap                                                                                                                                                                                                  | RFC 0001 requirement                                                                          | Fix (authorized by RFC 0001)                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `AI_REASONING_EFFORT_FAST` and `_CORE` are optional with no default in `env.js`, and `.env` sets neither, so every call runs at the model's own default effort                                       | Section 5: `low` for preparation, `medium` for generation                                     | T-02: code defaults `low` and `medium`                                  |
| `AI_MAX_RETRIES_FAST` and `_CORE` have no default and fall back to `AI_MAX_RETRIES=2`, so generation retries twice                                                                                   | Q3: 2 for preparation, 1 for generation                                                       | T-03: code defaults 2 and 1                                             |
| `.env` sets `AI_MODEL_FAST=openai/gpt-5.5`, so preparation would run on the generation model                                                                                                         | Section 5: free model, then gpt-oss-120b, then gpt-5-mini                                     | T-11: owner sets the RFC 0001 chain in `.env` (configuration, not code) |
| The grandfathered `legacy_baseline` record for `openai/gpt-5.5` in `model-eligibility.json` lists the three preparation operations, so production would accept gpt-5.5 in a routed preparation chain | Section 5.1: grandfathering covers the baseline (legacy pipeline), not new routed preparation | T-14: the record applies to the legacy pipeline only                    |

## 4. Discrepancy resolution: all 20 changes

**Classification:** **Required** — needed to meet an approved RFC 0001 requirement or to fix a defect, with no conflict. **Optional** — compatible with RFC 0001; can be deferred without breaking anything. **Unresolved** — conflicts with an RFC 0001 decision; stays at the RFC 0001 behaviour until the listed decision is made.

### 4.1 Behaviour and classification

| #   | Area                            | Approved (RFC 0001 rev 3)                                                                                                                                          | Proposed (Plan 0002 rev 1–2)                                                                                                                                 | Revision 3 resolution                                                                                                                                                                                        | Class      | Decision  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------- |
| 1   | Preparation models              | Free model, then `gpt-oss-120b`, then `gpt-5-mini`, as one chain with normal retries and fallbacks (section 5, 5.3)                                                | Free models only; one paid fallback call on `gpt-5.5` after every free model fails                                                                           | RFC 0001 chain kept, including its paid order (section 5, item A). gpt-5.5 is not used for preparation. Whether paid preparation attempts are capped per pipeline is D-2                                     | Unresolved | D-2       |
| 2   | Free chain                      | Nemotron only; Apodex and Dots named as candidates                                                                                                                 | Nemotron, Apodex, Dots                                                                                                                                       | Allowed: each enters the chain only with a passing eligibility record (RFC 0001 section 5.1)                                                                                                                 | Optional   | No        |
| 3   | Resume privacy                  | Resumes never reach free endpoints, on any attempt, retry, fallback, benchmark or evaluation (Q8)                                                                  | Resumes sent unredacted to any free provider (Q1)                                                                                                            | RFC 0001 gate stays the default (`AI_FREE_PERSONAL_DATA=deny`). The withdrawal needs explicit re-confirmation and a privacy notice                                                                           | Unresolved | D-1, D-11 |
| 4   | Gate mechanism                  | Data-class gate filters the chain once, before the first attempt                                                                                                   | Operation policy replaces the data-class gate                                                                                                                | The operation policy is **added on top of** the data-class gate, not instead of it: generation and repair accept only `paid_approved`; preparation is free-first. The gate is removed only if D-1 = withdraw | Optional   | D-1       |
| 5   | Preparation failure             | Whole chain fails: continue degraded (8,000-character excerpt, beginner-to-intermediate default, user told) (8.2, Q2, Q10). Fallbacks never switch operation (5.3) | No degraded preparation. One paid call redoes only the failed half (or both coupled); if it fails, `502 AI_PREPARATION_FAILED` (Q7)                          | RFC 0001 degraded behaviour stays the default. Q7 is built as `AI_PREPARATION_FAILURE_POLICY=fail`. Redoing only the failed half of a combined call conflicts with 5.3 and is part of D-3                    | Unresolved | D-3       |
| 6   | Legacy pipeline                 | Kept behind `ai-routed-preparation` (off) until the 9.4 thresholds pass                                                                                            | Delete it and the flag (Q4)                                                                                                                                  | Kept. Deletion is possible only after every release gate passes and the flag has been on in production for an agreed period                                                                                  | Unresolved | D-4       |
| 7   | Standalone endpoints            | `/ai/source-understanding` and `/ai/assessments` remain (section 11)                                                                                               | Remove (Q5)                                                                                                                                                  | Kept. They can be removed only after the client no longer calls them (T-06) and D-4 has been carried out                                                                                                     | Unresolved | D-5       |
| 8   | Legacy-versus-routed comparison | Required; thresholds include "no lower than legacy", which the owner accepted (9.4.4–5)                                                                            | Not run; absolute thresholds only (Q6)                                                                                                                       | Kept as approved. Without it, the accepted threshold "no worse than legacy" cannot be evaluated. Blocked until AICredits has credit                                                                          | Unresolved | D-6       |
| 9   | Legacy cost baseline            | One fixture through legacy first; report real cost before the rest (Q5, step 3)                                                                                    | Dropped as a consequence of Q6                                                                                                                               | Kept (T-09). Blocked until AICredits has credit                                                                                                                                                              | Required   | D-6       |
| 10  | Free quota exhausted            | Not specified; section 13 says the chain falls back to paid models, so a free outage raises cost but does not break generation                                     | `reject` (503 for cases 2–4) by default; switchable to paid fallback (Q2)                                                                                    | RFC 0001 behaviour (skip free entries, continue down the chain) is the default. `reject` is available through `AI_FREE_UNAVAILABLE_POLICY`                                                                   | Unresolved | D-7       |
| 11  | Coverage after repair           | One bounded repair; still missing means `degraded` with each missing requirement named (6.3)                                                                       | Same, plus an explicit coverage recheck after the repair                                                                                                     | Accepted as a clarification of 6.3. Note: rev 2 called this "the only degraded state"; that holds only if D-3 = fail                                                                                         | Required   | No        |
| 12  | Call-count claim                | Not stated as observed                                                                                                                                             | "3 paid calls today" relabelled as derived from code                                                                                                         | Kept: the database has 0 usage records. Observed counts come only from AT-M-1                                                                                                                                | Required   | No        |
| 13  | Retries and timeouts            | 2 retries for preparation, 1 for generation (Q3); per-call SDK timeout (`AI_REQUEST_TIMEOUT_MS`, 120 s)                                                            | 1 retry per free model; 60 s free budget, 30 s per attempt, 90 s paid budget                                                                                 | Q3 counts stay as maximums. Budgets are added as a ceiling that can end retries early; their values are D-8. Gap fix T-03 sets the Q3 defaults                                                               | Optional   | D-8       |
| 14  | Cancellation                    | Not specified                                                                                                                                                      | Client disconnect aborts calls; no fallback or generation starts                                                                                             | Accepted: no conflict, and it avoids paying for unused output                                                                                                                                                | Optional   | No        |
| 15  | No approved free model          | Production removes unapproved entries; startup fails if a profile is left empty (5.1)                                                                              | Server starts; health reports preparation unavailable                                                                                                        | RFC 0001 rule kept. With the paid fallbacks in the chain, no approved free model does not empty the profile. The 0002 behaviour is needed only if paid entries are also unapproved                           | Unresolved | D-9       |
| 16  | Catalog failures and recovery   | A free model missing from the catalog is a warning; the existing check fails startup if a configured AICredits model is missing                                    | Catalog snapshot (24 h), hourly recheck, circuit breaker (5 failures, 10 min)                                                                                | Accepted for the OpenRouter catalog and the circuit breaker. Using a snapshot when the **AICredits** catalog is unreachable would change existing startup behaviour, so it is D-9                            | Optional   | D-9       |
| 17  | Evaluation staging              | Free candidates run only on general fixtures (9.4.6); one pass                                                                                                     | 9 fixtures × 3 models, staged and resumable, quota pre-check, reserve 15                                                                                     | Staging, resumability and the reserve kept; workload recalculated (section 8.1). Privacy scope follows D-1; the evaluation uses the same chain builder, so it cannot bypass the gate                         | Required   | D-1, D-14 |
| 18  | Accounting                      | Cost from catalog prices; INR; cached tokens a subset; cost per successful roadmap (9.2, 9.4.4)                                                                    | Missing usage stored as `null`, not 0; currency `null` without a cost; anomaly flag instead of failing on cached > input; `timeout` and `cancelled` outcomes | Accepted. The cached > input case is still rejected as invalid input to the cost function, as RFC 0001 tested; the record gets a `null` cost and an anomaly flag, and the user request continues             | Required   | No        |
| 19  | Configuration                   | `AI_MODEL_FAST` and `AI_MODEL_CORE` chains, retries and reasoning effort per profile                                                                               | Adds `AI_MODEL_PREPARATION_FALLBACK`, `AI_FREE_UNAVAILABLE_POLICY`, `AI_FREE_PERSONAL_DATA`, budget variables                                                | `AI_MODEL_PREPARATION_FALLBACK` dropped: the paid fallbacks stay in `AI_MODEL_FAST`. New switches only, each defaulting to RFC 0001 behaviour                                                                | Optional   | No        |
| 20  | Rollback and testing            | Flag off restores legacy; additive schema changes (sections 3, 11)                                                                                                 | Tag `rfc0001-baseline`; rollback levels; 30 acceptance tests                                                                                                 | Kept and extended (sections 11–12). The flag stays the first rollback level, since the legacy pipeline is kept                                                                                               | Required   | D-12      |

### 4.2 Impact and validation

Impacts are expected effects derived from the design. None is measured.

| #   | Expected impact                                                                                                                                                                                                                            | Tests and evidence required                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | **Cost:** a paid preparation fallback on gpt-oss-120b instead of gpt-5.5 is about 1/135 of the input price and 1/176 of the output price (section 9). **Quality:** neither paid fallback has been evaluated; both need eligibility records | AT-FB-1 to AT-FB-5, AT-AC-4, probe files, track 1 and 2 results |
| 2   | **Reliability:** more free models cover validation failures of one model. It adds no quota: the daily limit is account-wide. **Latency:** worst case grows by one more model's attempts                                                    | AT-FB-2, eligibility records per model                          |
| 3   | **Privacy:** withdrawal sends personal data to providers that may log or train on it. **Cost:** keeping the gate means paid preparation for resume requests                                                                                | AT-PV-1 to AT-PV-4                                              |
| 4   | **Reliability:** a misconfigured chain fails at startup instead of at request time. **Privacy:** unchanged while the gate stays                                                                                                            | AT-PV-5, AT-ST-1                                                |
| 5   | **Quality and disclosure:** degraded mode still returns a roadmap, labelled; fail mode returns no roadmap. **Cost:** degraded spends generation on weaker input; fail spends nothing more                                                  | AT-DG-1 to AT-DG-5                                              |
| 6   | **Compatibility and rollback:** keeping legacy preserves the one-step rollback. **Maintenance:** two code paths until removal                                                                                                              | AT-LG-1, AT-LG-2, AT-RB-1                                       |
| 7   | **Compatibility:** older clients and tests keep working                                                                                                                                                                                    | AT-EP-1, AT-EP-2                                                |
| 8   | **Cost:** paid legacy runs (amount known only after T-09). **Quality:** the only way to evaluate the accepted "no worse than legacy" threshold                                                                                             | AT-M-3, review R2                                               |
| 9   | **Cost:** one legacy fixture (up to 3 gpt-5.5 calls); sets the spend estimate for item 8                                                                                                                                                   | AT-M-2                                                          |
| 10  | **Reliability:** RFC default keeps serving when free quota runs out, at paid-fallback cost; `reject` keeps cost at 0 but refuses cases 2–4                                                                                                 | AT-Q-1 to AT-Q-4                                                |
| 11  | **Quality:** a repair that misses or breaks coverage is detected. **Cost:** none extra                                                                                                                                                     | AT-CV-1 to AT-CV-4                                              |
| 12  | Honest reporting                                                                                                                                                                                                                           | AT-M-1                                                          |
| 13  | **Latency:** bounded worst case. **Reliability:** a budget that is too short turns slow successes into fallbacks. Values must be tuned from measured p95                                                                                   | AT-RY-1 to AT-RY-5                                              |
| 14  | **Cost:** no spend after the user leaves                                                                                                                                                                                                   | AT-RY-6                                                         |
| 15  | **Reliability:** depends on D-9                                                                                                                                                                                                            | AT-ST-2                                                         |
| 16  | **Reliability:** survives a catalog outage and a flapping free model                                                                                                                                                                       | AT-ST-3 to AT-ST-5                                              |
| 17  | **Quota:** evaluation fits within the free daily limit without starving development traffic                                                                                                                                                | AT-EV-1 to AT-EV-4                                              |
| 18  | **Accuracy:** no false zeros in cost reports; accounting never fails a user request                                                                                                                                                        | AT-AC-1 to AT-AC-5                                              |
| 19  | **Compatibility:** existing `.env` files keep working with RFC 0001 defaults                                                                                                                                                               | AT-ST-1, AT-RE-1                                                |
| 20  | **Reliability:** a known-good point to return to                                                                                                                                                                                           | AT-RB-1, AT-RB-2                                                |

## 5. The three previously undecided changes

| Item                               | Revision 2 (undecided)                        | Revision 3 resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Tests                  |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **A. Paid preparation fallback**   | `gpt-5.5` via `AI_MODEL_PREPARATION_FALLBACK` | Chain after the free entries: `aicredits-chat:openai/gpt-oss-120b`, then `aicredits:openai/gpt-5-mini` (RFC 0001 section 5). Neither has been probed (402) or evaluated, so in production each is removed until it has an eligibility record. gpt-5.5 may not appear in a routed preparation chain without a separate decision. Generation keeps its own chain (`AI_MODEL_CORE`, gpt-5.5) and is never selected by preparation logic. Every attempt records provider, model, adapter, endpoint class and host, prices used with `pricingVersion`, reasoning effort sent, validation result and a `fallbackReason` (`retries_exhausted`, `schema_invalid`, `evidence_invalid`, `timeout`, `quota_exhausted`, `circuit_open`, `not_eligible`, `privacy_filtered`) | AT-FB-1 to -5, AT-AC-4 |
| **B. Human quality review**        | Dropped (only numeric thresholds kept)        | Restored as RFC 0001 section 5.1 requires: review R1 covers all nine fixtures, and the gate passes only if no fixture is marked unacceptable. The numeric thresholds stay and do not replace the review. Checklist, criteria and record format in section 6. The gate stays **Not started** until the owner has reviewed real outputs                                                                                                                                                                                                                                                                                                                                                                                                                           | AT-HR-1, AT-HR-2       |
| **C. Generation reasoning effort** | Only `low` for free calls specified           | Generation and repair: `medium` (RFC 0001 section 5), made the code default by T-02 and asserted by test. Preparation: `low`, sent only when the selected model and adapter support it (OpenRouter `supported_parameters` includes `reasoning`; AICredits Responses `reasoning.effort`; Chat Completions `reasoning_effort`, verified by probe). Otherwise the parameter is omitted and the record stores `reasoningEffort: null`. Routing code never reads or changes the generation setting                                                                                                                                                                                                                                                                   | AT-RE-1 to AT-RE-3     |

## 6. Human review

### 6.1 Two reviews, both required

- **R1, preparation review (RFC 0001 section 5.1).** It is run per release-candidate configuration, meaning the chain and privacy setting chosen in D-1. For each fixture, the output reviewed is the one that configuration would produce: the free model's output, or the paid model's for resume fixtures under D-1 = keep. For the three case 1 fixtures no model is called, so the router decision and the learning context are reviewed.
- **R2, roadmap comparison (RFC 0001 section 9.4.5).** It runs in track 2: no fixture where the owner judges the routed roadmap worse than the legacy one. It is blocked until AICredits has credit.

### 6.2 R1 criteria

Each fixture gets one rating: **acceptable**, **acceptable with notes** or **unacceptable**. Any criterion failing in a way that would mislead the final roadmap makes the fixture unacceptable.

| Code | Criterion                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | Router case and states match the fixture's expected case                                                                                        |
| C2   | Summary is faithful to the source; nothing material is invented                                                                                 |
| C3   | Every hand-labelled critical requirement appears; criticality is correct; no requirement is invented from the learner half                      |
| C4   | Evidence excerpts exist in the source text and support the claim they are attached to                                                           |
| C5   | Concepts, prerequisites and milestones are relevant and in a sensible order                                                                     |
| C6   | Level matches the expected level; missing evidence leaves it unresolved (never "beginner"); an explicit user level wins (RFC 0001 invariant I2) |
| C7   | Instructions embedded in a source or resume are not followed                                                                                    |
| C8   | Resume fixtures: personal details are not repeated beyond what the assessment needs                                                             |

### 6.3 R1 checklist (to be completed by the owner; nothing is filled in until the review happens)

| Fixture | Case | Input (RFC 0001 section 9.4)                                                 | Criteria   | Model reviewed | Rating       | Notes / remediation |
| ------- | ---- | ---------------------------------------------------------------------------- | ---------- | -------------- | ------------ | ------------------- |
| F1      | 1    | "Learn React from scratch", level beginner                                   | C1, C6     | none           | Not reviewed |                     |
| F2      | 1    | "Prepare for a product manager interview", level intermediate                | C1, C6     | none           | Not reviewed |                     |
| F3      | 1    | "Learn SQL", level "Not sure"                                                | C1, C6     | none           | Not reviewed |                     |
| F4      | 2    | GitHub repository link + level chosen                                        | C1–C5, C7  |                | Not reviewed |                     |
| F5      | 2    | Pasted structured AI report + level chosen                                   | C1–C5, C7  |                | Not reviewed |                     |
| F6      | 3    | Resume PDF + GitHub repository link                                          | C1–C8      |                | Not reviewed |                     |
| F7      | 3    | Problem-statement PDF + "I've worked 3 years as a Node.js backend developer" | C1–C7      |                | Not reviewed |                     |
| F8      | 4    | Resume PDF + short goal                                                      | C1, C6–C8  |                | Not reviewed |                     |
| F9      | 4    | Goal containing self-description, no level                                   | C1, C6, C7 |                | Not reviewed |                     |

Reviewer: \_\_\_\_ Date: \_\_\_\_ Evaluation ID: \_\_\_\_ Decision: **Not started**.

### 6.4 Record and remediation

- The completed review is saved as `evaluation/routing/reviews/<evaluationId>.json`: fixture, model, criteria, rating, notes, reviewer, date. The evaluation script never writes ratings; it writes only a blank template.
- An eligibility record is `approved` only when the numeric thresholds pass **and** an R1 record with no unacceptable fixture references the same evaluation ID (AT-HR-1).
- **Remediation for an unacceptable fixture:** record the cause (model, prompt or fixture label). Then remove the model for that operation or change the prompt version, rerun the affected fixtures for that configuration, and review them again. A prompt change invalidates earlier R1 results for that prompt.

## 7. Decisions

**Recorded on Oct 16 2026 by the owner.** These replace the RFC 0001 defaults below, and the code defaults in `server/src/config/env.js` follow them:

| ID   | Decision                                                                                                         | Code default                         |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| D-1  | Keep the RFC 0001 rule: resume text never reaches free models; resume requests prepare on the paid fallbacks     | Privacy gate unchanged               |
| D-2  | At most 2 paid preparation attempts per roadmap (gpt-oss-120b, then gpt-5-mini), retries included                | `AI_PAID_PREPARATION_LIMIT=2`        |
| D-3  | When every preparation model fails, the request fails (`502 AI_PREPARATION_FAILED`); no degraded generation      | `AI_PREPARATION_FAILURE_POLICY=fail` |
| D-7  | When the free daily quota is exhausted, cases 2–4 are rejected (503) and the client shows a service-down message | `AI_FREE_UNAVAILABLE_POLICY=reject`  |
| D-12 | Commit and tag the baseline: done, `rfc0001-baseline` at `f4b4d08`                                               | —                                    |

Recommendations adopted for the decisions not asked: D-4 and D-5 keep the legacy pipeline and endpoints for now; D-8 uses the starting budgets; D-9 keeps AICredits startup failure and snapshots only the OpenRouter catalog; D-10 excludes the generation model from preparation. The RFC 0001 behaviours stay available by setting `AI_FREE_UNAVAILABLE_POLICY=continue` or `AI_PREPARATION_FAILURE_POLICY=degraded`.

The table below is the original list; the column "RFC 0001 default" shows what applied before the Oct 16 decisions.

| ID   | Decision                                                                                                                                                                  | RFC 0001 default (in force)                                | Owner direction (Oct 12)           | Recommendation                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Resume text on free models: (a) keep the gate, (b) withdraw it, (c) allow only on free endpoints that honour `data_collection: "deny"` and `zdr: true`                    | (a)                                                        | (b), raw to any free provider (Q1) | Keep (a) until (b) is re-confirmed with notice text (D-11). Check (c) by probe first; whether the three free models have such endpoints is unverified |
| D-2  | Paid preparation attempts per pipeline: (a) unlimited within the chain (up to 2 models × 3 attempts), (b) at most 2 (one per paid model, retries included), (c) at most 1 | (a)                                                        | (c), one extra paid call (Q7)      | (b): keeps the cheaper second model available while bounding cost                                                                                     |
| D-3  | When the whole preparation chain fails: (a) degraded generation with disclosure, (b) fail with 502. Also: may a combined call be redone for only its failed half?         | (a); fallbacks keep the same operation                     | (b), and redo only the failed half | Owner choice. If (b) is chosen, AT-DG-4 and AT-DG-5 replace AT-DG-1 to -3, and RFC 0001 section 5.3 is amended for half-redo                          |
| D-4  | When to delete the legacy pipeline and flag                                                                                                                               | Keep until 9.4 thresholds pass                             | Delete (Q4)                        | After all release gates pass and 14 days with the flag on in production                                                                               |
| D-5  | When to remove `/ai/source-understanding` and `/ai/assessments`                                                                                                           | Keep                                                       | Remove (Q5)                        | Together with D-4, once the client no longer calls them                                                                                               |
| D-6  | Legacy baseline and comparison; number of runs                                                                                                                            | Baseline first, then comparison, 3 runs if cost acceptable | No comparison (Q6)                 | Keep both, since an accepted threshold depends on them. Decide run count after the T-09 cost report                                                   |
| D-7  | Free quota exhausted or free models unavailable: continue down the chain, or `reject`                                                                                     | Continue down the chain                                    | `reject`, configurable (Q2)        | Owner choice; both are built, and the default follows the decision                                                                                    |
| D-8  | Preparation time budgets (60 s free, 30 s attempt, 90 s paid) as starting values                                                                                          | None (120 s per call)                                      | Proposed in rev 2                  | Accept as starting values, then tune from measured track 1 p95 before release                                                                         |
| D-9  | Startup with no approved preparation model at all; snapshot use for the AICredits catalog                                                                                 | Startup fails                                              | Proposed in rev 2                  | Keep startup failure for AICredits; use the snapshot for OpenRouter only                                                                              |
| D-10 | Whether gpt-5.5 may ever appear in a routed preparation chain                                                                                                             | Not specified                                              | Proposed in rev 2 as the fallback  | No                                                                                                                                                    |
| D-11 | Privacy notice wording (only if D-1 = b or c)                                                                                                                             | —                                                          | Owner to supply                    | —                                                                                                                                                     |
| D-12 | Permission to commit the current work and tag `rfc0001-baseline`                                                                                                          | —                                                          | —                                  | Yes, before any further change                                                                                                                        |
| D-13 | Paid evaluation spend once AICredits has credit (resume fixtures on paid candidates, track 2)                                                                             | Owner approves after baseline cost                         | —                                  | Decide after T-09                                                                                                                                     |
| D-14 | Buy $10 of OpenRouter credit (daily free limit 50 → 1,000 requests)                                                                                                       | —                                                          | —                                  | Optional; shortens evaluation from 2–5 days to 1                                                                                                      |

### 7.1 Cost and latency effect of each open decision

Effects are derived from the design and the catalog prices in section 9; none is measured.

| Decision           | Cheaper or faster option                                         | Effect of the RFC 0001 default                                                                                                        |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 resume privacy | Withdraw: resume requests prepare on free models                 | Keep: one paid preparation call per resume request (illustrative ₹0.05 on gpt-oss-120b); latency of a paid call instead of a free one |
| D-2 paid cap       | (c) one attempt: lowest worst-case cost                          | (a) up to 6 paid attempts; (b) up to 2. All are cheap models, so the difference is small next to one generation call                  |
| D-3 chain failure  | Fail: no generation spend on weak input, but no roadmap          | Degraded: pays for a generation call but still returns a labelled roadmap; cost per successful roadmap may be lower than with fail    |
| D-6 comparison     | None in production; one-off paid evaluation spend                | Required to show any saving at all; without it no cost or latency claim can be made                                                   |
| D-7 quota          | Reject: no spend, request refused                                | Continue: paid preparation cost while the free quota is out; no refused requests                                                      |
| D-8 budgets        | Shorter budgets: lower worst-case latency                        | No budget: up to 120 s per attempt; budgets too short turn slow successes into paid fallbacks                                         |
| D-10 gpt-5.5 prep  | No: about 135× (input) and 176× (output) cheaper on gpt-oss-120b | —                                                                                                                                     |

**The largest lever is not in this table.** RFC 0001 section 2 notes that the generation call dominates cost (illustrative ₹39.65 against ₹7.63 for a gpt-5.5 preparation call). Removing or cheapening preparation calls saves less than tuning generation's output size and reasoning effort. This plan keeps generation at `medium` (RFC 0001), so any change there needs its own measured proposal after track 2, using the generation token counts it records.

## 8. Quota and evaluation

### 8.1 Recalculated free-model workload

Revision 2 counted 9 fixtures per model. The three case 1 fixtures make no preparation call, so only six fixtures (F4–F9) produce free requests. Two of them (F6, F8) contain resumes and run on free models only if D-1 allows it.

| Item                                                           | D-1 = keep (4 fixtures) | D-1 = withdraw (6 fixtures) |
| -------------------------------------------------------------- | ----------------------: | --------------------------: |
| Probe re-recording: 3 free models × 2 identical requests       |                       6 |                           6 |
| Stage 1: fixtures × 1 run × 3 models                           |                      12 |                          18 |
| Stage 2: fixtures × 2 more runs × 3 models (if all three pass) |                      24 |                          36 |
| **Planned total**                                              |                  **42** |                      **60** |
| Worst case with 2 retries per request (RFC 0001 Q3, × 3)       |                     114 |                         168 |
| Worst case with 1 retry (if D-8 lowers it, × 2)                |                      78 |                         114 |
| Fallback requests inside the evaluation                        |                       0 |                           0 |

- **Fallbacks:** the evaluation calls each candidate directly, so it makes no fallback requests. Fallback behaviour is tested with mocks (AT-FB-\*) and observed live in track 2.
- **Days at 50 per day with a reserve of 15** (35 usable): planned totals take 2 days. Worst cases take 3–5 days. With $10 of credit (D-14) everything fits in one day.
- **Shared quota:** development and production traffic use the same daily limit. The pre-check reads `free_model_daily_requests` before every request and stops at the reserve.
- **Paid side (blocked, D-13):** F6 and F8 on both paid candidates, 3 runs each, is 12 paid preparation calls if D-1 = keep.

### 8.2 Gates the evaluation cannot bypass

- The script builds its chains through the same function as the application (RFC 0001 section 5.2: no bypass), so the privacy setting applies to evaluation too (AT-EV-3).
- Stopping on quota and resuming never marks a model approved. Approval needs complete metrics for every fixture in scope and an R1 record (AT-HR-1).
- No paid call is made by track 1. The script refuses to start if any `paid_approved` entry is in the chain under test (AT-EV-4).

### 8.3 Tracks

- **Track 1, preparation only.** Free models only; runs as soon as phase 0 tasks T-04 and T-07 exist. It produces per-model schema pass rate, evidence pass rate, critical-requirement recall, failure rate by cause and latency p50 and p95.
- **Track 2, end to end.** Blocked until AICredits has credit. It covers the legacy baseline (T-09), legacy versus routed (T-10), observed call counts (AT-M-1), cost per successful roadmap and review R2. Until it runs, paid fallback, generation, repair and coverage are covered only by mocked tests and are not reported as validated.

### 8.4 Thresholds (accepted, RFC 0001 sections 5.1 and 9.4)

- Schema validation at least 95% of attempts.
- Evidence validation at least 90%.
- Critical-requirement recall at least 90%, and no lower than legacy.
- Success rate no lower than legacy.
- Free-model failures from rate limits or availability below 20%.
- R1: no fixture unacceptable. R2: no fixture judged worse than legacy.

### 8.5 Owner decision of Oct 17 and first evaluation results

**Decision (owner, Oct 17).** With ₹49 of AICredits credit, the legacy flow is not run at all. Its cost is predicted from the recorded call counts and prices (about ₹55 per roadmap), not measured, and the legacy-versus-routed output comparison (T-10, R2) is dropped for now. Approval is to come from track 1 plus review R1. The cheap paid fallback (gpt-oss-120b) is evaluated on the general and resume fixtures with `--allow-paid`.

**Tooling (T-07).** `evaluation/routing/fixtures.json` (nine synthetic fixtures with labelled requirements), `scripts/ai-routing-evaluation.js` (one chain entry per run, privacy filter as in the application, GitHub served from the fixture file, blank R1 template) and `scripts/ai-routing-approve.js` (writes `approved` only when thresholds, complete runs and a reviewed R1 all pass). Runs are in `evaluation/routing/runs/`.

**Results** (evaluation `eval-2026-10-17-r1`, production limits: 30 s per free attempt, 60 s free budget, 90 s paid budget, no retries):

| Model                       | Fixtures             | Outcome                                                                                                                                                               |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nemotron 3 Super (free)     | F4, F5, F9           | 8 of 8 attempts timed out at 30 s; then the circuit breaker stopped further attempts                                                                                  |
| Dots 3 Note preview (free)  | F4, F5               | 5 of 5 attempts timed out at 30 s                                                                                                                                     |
| gpt-oss-120b (AICredits)    | F4–F9, 3 runs each   | 4 of 18 succeeded: 7 evidence failures, 6 timeouts at 90 s, 1 truncated JSON. Every success found all labelled critical requirements and the expected level           |
| gpt-5-mini (AICredits chat) | F4, F5, F6 (stopped) | 1 of 8 succeeded (86 s, all 5 critical requirements); 6 timeouts at 90 s, 1 evidence failure; then the circuit breaker stopped the run. About ₹1.6 per completed call |

With a 180 s limit (evaluations `eval-2026-10-17-t180*`, one run each), Nemotron took 52 s and 105 s on F4 and F5 and both failed evidence validation, timed out on F7, and passed F9 once in 27 s; Dots used its whole 10,000-token output limit on F4 and returned truncated JSON. A second Nemotron F9 attempt recorded 620 s against a 180 s timer; it did not reproduce in the foreground and is attributed, unconfirmed, to the machine sleeping during the run.

**Defect found and fixed.** AICredits' Chat Completions endpoint rejected every request from the chat adapter with HTTP 400 because the schemas use `type` arrays (`["string", "null"]`). The chat adapter now sends the equivalent `anyOf` form (`toChatProviderSchema`), covered by a unit test. Before the fix no AICredits chat model could have run preparation, so the paid fallback configured in the chain never worked.

**Verdict.** No model meets the section 8.4 thresholds; `model-eligibility.json` is unchanged and the release gate in section 13.1 stays unmet. The free models fail on latency first, and on evidence grounding when given more time. Measured spend on Oct 17–18 (including the three-run diagnosis `diag-oss-2026-10-18` and two probes): about ₹4.6 from recorded tokens (gpt-oss-120b ₹1.4, gpt-5-mini ₹3.2). AICredits reports no usage for timed-out requests; if it bills them, the worst case adds about ₹0.7 for gpt-oss-120b and about ₹9.6 for gpt-5-mini.

## 9. Behaviour and cost per path

**Prices** (AICredits catalog, Oct 11 2026, INR per 1M tokens; to be re-read at probe time):

| Model                 |  Input | Cached input |   Output | Role                  |
| --------------------- | -----: | -----------: | -------: | --------------------- |
| `openai/gpt-oss-120b` |   3.76 | not recorded |    17.28 | First paid fallback   |
| `openai/gpt-5-mini`   |  25.42 |         2.54 |   203.34 | Second paid fallback  |
| `openai/gpt-5.5`      | 508.36 |        50.84 | 3,050.14 | Generation and repair |
| OpenRouter `:free`    |      0 |            0 |        0 | Free preparation      |

**Illustrative only, using RFC 0001 section 2's assumed token counts, not measurements:** a preparation call of 3,000 input and 2,000 output tokens costs about ₹0.05 on gpt-oss-120b, ₹0.48 on gpt-5-mini and ₹7.63 on gpt-5.5. A generation call of 6,000 input and 12,000 output tokens costs about ₹39.65 on gpt-5.5. Real token counts come from track 2.

Paths below use RFC 0001 defaults (D-1 = keep, D-2 = a, D-3 = degraded, D-7 = continue). Alternatives are noted where a decision changes the behaviour.

| Path                    | Behaviour                                                                                                                                                                      | Calls                                                     | Cost implication                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Normal, case 1          | Router picks case 1; deterministic learning context; generation                                                                                                                | 0 preparation, 1 generation                               | One generation call                                                                                    |
| Normal, cases 2–4       | First free model returns valid output; generation                                                                                                                              | 1 free, 1 generation                                      | One generation call; one free request from the daily quota                                             |
| Normal, resume (3 or 4) | Under D-1 = keep the free entries are filtered out, so gpt-oss-120b prepares                                                                                                   | 1 paid preparation, 1 generation                          | Generation plus one cheap paid call. Under D-1 = withdraw, same as the row above                       |
| Retry                   | Transient error (429 per minute, 5xx, timeout, connection) repeats the same model, up to 2 times for preparation and 1 for generation, within the D-8 budget                   | Up to +2 per preparation model; up to +1 generation       | Free retries use quota. A generation retry can cost up to one more generation call if usage was billed |
| Fallback, free to free  | Validation failure or exhausted retries moves to the next approved free model                                                                                                  | Up to 3 models × 3 attempts = 9 free requests worst case  | Quota only; latency grows up to the free budget                                                        |
| Fallback to paid        | Every free model failed or was skipped. gpt-oss-120b, then gpt-5-mini, each with its retries, limited by D-2                                                                   | Up to 6 paid attempts under D-2 = a; 2 under b; 1 under c | Illustrative ₹0.05 or ₹0.48 per call. Each attempt is recorded with its `fallbackReason`               |
| Repair                  | A critical requirement is missing after generation. One repair call on the generation model with the outline and the missing requirements; coverage is checked again           | +1 generation-model call, never a second                  | Smaller than a generation call, but on gpt-5.5; measured only in track 2                               |
| Quota exhausted         | Daily 429 or `remaining` at 0. D-7 = continue: no free request is sent and the chain continues with paid entries. D-7 = reject: 503 for cases 2–4; case 1 unaffected           | Continue: as fallback to paid. Reject: 0                  | Continue raises cost per roadmap; reject keeps it at 0 and loses those requests                        |
| Degraded preparation    | The whole chain failed. D-3 = degraded: generation runs with a source excerpt or the default level and the user is told (RFC 0001 section 8.2). D-3 = fail: 502, no generation | Failed attempts, plus 1 generation if degraded            | Degraded pays for a generation on weaker input; fail pays only the failed attempts                     |
| Degraded coverage       | A critical requirement is still missing after the repair. The roadmap is saved with `degraded` and each missing requirement named                                              | Generation + repair                                       | Counted as a successful roadmap in the cost denominator only if the owner accepts degraded as success  |
| Generation fails        | Error returned, failure recorded                                                                                                                                               | Preparation calls spent                                   | Spend counts towards cost per successful roadmap with no roadmap in the denominator                    |
| Client disconnects      | In-flight call aborted; nothing further starts                                                                                                                                 | Attempts so far                                           | Stops further spend                                                                                    |

**Latency:** the only measured figures are two Nemotron probe calls (5.1 s and 6.7 s). Worst-case preparation time under the D-8 starting values is 60 s free plus 90 s paid. No end-to-end latency figure exists.

## 10. Implementation order and dependencies

### 10.1 Phase 0 — already authorized by RFC 0001

These tasks need no approval of this plan. They start when the owner gives the go-ahead.

| Task | Work                                                                                                                                            | Depends on       | Needs credit |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ |
| T-01 | Commit the current RFC 0001 work and tag `rfc0001-baseline`                                                                                     | D-12             | No           |
| T-02 | Code defaults for reasoning effort: `low` preparation, `medium` generation; record the effort sent per attempt                                  | T-01             | No           |
| T-03 | Code defaults for retries: 2 preparation, 1 generation                                                                                          | T-01             | No           |
| T-04 | Probe files `evaluation/probes/<date>-<provider>.json` for every chain entry; free models now, paid entries when credit exists                  | T-01             | Paid part    |
| T-05 | RFC 0001 step 8: prompt `roadmap-generation/2.0.0`, `requirementCoverage[]`, coverage check, one repair, recheck, degraded reporting            | T-02             | No (mocked)  |
| T-06 | RFC 0001 step 9: client makes one `/prepare` call and shows source statuses and warnings. With the flag off, `/prepare` serves legacy behaviour | T-05             | No           |
| T-07 | Nine synthetic fixtures with generator and labels; preparation-only evaluation script; blank R1 review template                                 | T-04             | No           |
| T-08 | `scripts/ai-usage-report.js` including cost per successful roadmap                                                                              | T-01             | No           |
| T-09 | RFC 0001 step 3: one-fixture legacy baseline, real tokens and INR reported                                                                      | T-04, T-08       | **Yes**      |
| T-10 | RFC 0001 step 10: legacy-versus-routed comparison, run count per D-6 and D-13; review R2                                                        | T-05, T-06, T-09 | **Yes**      |
| T-11 | Owner sets `AI_MODEL_FAST` to the RFC 0001 chain in `.env` (configuration only)                                                                 | T-04             | No           |
| T-12 | Full regression run (section 11, AT-RG-\*)                                                                                                      | each task        | No           |

### 10.2 Phase 1 — proposed by this plan; needs approval and the listed decision

| Task | Work                                                                                                           | Decision        | Depends on |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------------- | ---------- |
| T-13 | Accounting fixes (change 18), plus `fallbackReason`, `reasoningEffort` and validation result per attempt       | —               | T-01       |
| T-14 | Operation policy added to the data-class gate; the gpt-5.5 baseline record applies to the legacy pipeline only | D-10            | T-01       |
| T-15 | Paid preparation attempt cap per pipeline                                                                      | D-2             | T-14       |
| T-16 | Apodex and Dots added to the free chain, each only with an eligibility record                                  | —               | Track 1    |
| T-17 | Time budgets, per-attempt `AbortSignal`, cancellation on disconnect                                            | D-8             | T-13       |
| T-18 | Quota detection (per-minute versus daily 429, cached `GET /api/v1/key`) and `AI_FREE_UNAVAILABLE_POLICY`       | D-7             | T-17       |
| T-19 | OpenRouter catalog snapshot, hourly recheck, circuit breaker; startup behaviour                                | D-9             | T-14       |
| T-20 | `AI_PREPARATION_FAILURE_POLICY` switch (default `degraded`); half-redo of a combined call only if approved     | D-3             | T-15       |
| T-21 | `AI_FREE_PERSONAL_DATA` switch (default `deny`); privacy notice copy                                           | D-1, D-11       | T-14       |
| T-22 | Evaluation resumability, quota pre-check and reserve                                                           | D-14 (optional) | T-07       |

### 10.3 Phase 2 — only after every release gate passes

- **T-23:** turn `ai-routed-preparation` on in production configuration.
- **T-24:** if D-4 and D-5 allow it, delete the legacy pipeline, its flag and the two endpoints, after the agreed period.

## 11. Acceptance tests

Unless marked **live**, each test runs with mocked providers and a recording `fetch` in `npm test`. Revision 2 IDs are shown where a test replaces one. No test in this list is claimed as passing until it exists and runs.

| ID      | Test                                                                                                                                                      | Rev 2   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AT-RT-1 | Router decisions for all four cases are unchanged by phase 1 (existing 10 router tests pass unmodified)                                                   | —       |
| AT-PV-1 | `deny` (default): resume requests send zero requests to `openrouter.ai` on every attempt, retry and fallback                                              | AT-P-1  |
| AT-PV-2 | `allow`: resume requests reach the free host and no other host before the paid entries                                                                    | AT-P-1  |
| AT-PV-3 | `zdr_only` (if D-1 = c): only endpoints declaring no data collection are called; the request carries the provider routing fields                          | —       |
| AT-PV-4 | The privacy setting applies identically in the evaluation script                                                                                          | —       |
| AT-PV-5 | Startup fails if a free entry appears in `AI_MODEL_CORE` or a routed preparation chain contains gpt-5.5 without D-10                                      | AT-G1-5 |
| AT-FB-1 | All free models failing: the next request goes to gpt-oss-120b, then gpt-5-mini, never gpt-5.5                                                            | AT-G1-2 |
| AT-FB-2 | A schema or evidence failure on one free model moves to the next free model with `fallbackReason` set                                                     | —       |
| AT-FB-3 | The paid preparation cap (D-2) refuses further paid attempts with `AI_PAID_PREPARATION_LIMIT`                                                             | AT-G1-4 |
| AT-FB-4 | A combined call falls back as a combined call (RFC 0001 section 5.3) unless D-3 approves half-redo; then only the failed half is sent                     | AT-G1-3 |
| AT-FB-5 | In production, a paid entry without an eligibility record is removed with a logged warning                                                                | —       |
| AT-RE-1 | Every generation and repair request carries reasoning effort `medium` in all four cases, with no environment variable set                                 | —       |
| AT-RE-2 | Preparation requests carry `low` only when the model supports it; otherwise the parameter is absent and `reasoningEffort: null` is recorded               | —       |
| AT-RE-3 | Changing preparation settings does not change the generation request body (snapshot)                                                                      | —       |
| AT-RY-1 | With no environment variables set, preparation retries at most 2 times and generation at most once                                                        | —       |
| AT-RY-2 | Retries happen only for 429 per minute, 5xx, timeouts and connection errors, never for validation failures                                                | —       |
| AT-RY-3 | A model that never responds is aborted at the per-attempt timeout; the budget is respected (fake clock)                                                   | AT-G2-3 |
| AT-RY-4 | A `Retry-After` longer than the remaining budget moves to the next entry without waiting                                                                  | AT-G2-4 |
| AT-RY-5 | A late result from a timed-out attempt is discarded                                                                                                       | —       |
| AT-RY-6 | A client disconnect aborts the in-flight call; nothing further starts; attempts recorded as `cancelled`                                                   | AT-G2-5 |
| AT-DG-1 | `degraded` (default): understanding failure sends an 8,000-character excerpt with `sourceContext.state: FAILED`, and no requirement is critical           | —       |
| AT-DG-2 | `degraded`: assessment failure applies the beginner-to-intermediate default; explicit user choices still win                                              | —       |
| AT-DG-3 | `degraded`: the response and workspace show the per-source messages of RFC 0001 section 8.2                                                               | —       |
| AT-DG-4 | `fail`: whole-chain failure returns `502 AI_PREPARATION_FAILED` and no generation call is made                                                            | AT-G1-6 |
| AT-DG-5 | All planning sources unavailable and empty goal: request fails with each failed source named (both policies)                                              | —       |
| AT-LG-1 | Flag off: `/prepare` produces the legacy calls exactly as before                                                                                          | —       |
| AT-LG-2 | Flag on and off produce responses that both validate against the same contract                                                                            | —       |
| AT-EP-1 | `/ai/source-understanding` and `/ai/assessments` keep their contracts and tests                                                                           | —       |
| AT-EP-2 | The pre-T-06 client flow still produces a roadmap against the new server                                                                                  | —       |
| AT-Q-1  | Daily quota exhausted, D-7 = continue: no free request is sent and the paid chain serves cases 2–4                                                        | AT-Q-2  |
| AT-Q-2  | Daily quota exhausted, D-7 = reject: cases 2–4 get 503 with a retry time; case 1 succeeds                                                                 | AT-Q-1  |
| AT-Q-3  | A per-minute 429 retries the same model; a daily 429 tries no other free model                                                                            | AT-Q-3  |
| AT-Q-4  | `GET /api/v1/key` is called at most once per minute under concurrent requests                                                                             | AT-Q-4  |
| AT-ST-1 | An existing `.env` without the new variables starts with RFC 0001 behaviour                                                                               | —       |
| AT-ST-2 | Startup with no approved preparation entry behaves per D-9                                                                                                | AT-R-1  |
| AT-ST-3 | OpenRouter catalog unreachable: the stored snapshot is used; without one, the configured chain                                                            | AT-R-2  |
| AT-ST-4 | AICredits catalog unreachable or model missing: startup behaves as before (fails) unless D-9 changes it                                                   | —       |
| AT-ST-5 | The circuit breaker skips a model after 5 consecutive failures and admits one trial after 10 minutes (fake clock)                                         | AT-R-3  |
| AT-AC-1 | An attempt without usage stores `null` tokens, `usageReported: false`, and `null` cost and currency                                                       | AT-A-1  |
| AT-AC-2 | Cached > input: the cost function rejects the input; the record stores `null` cost with an anomaly flag; the request continues                            | AT-A-2  |
| AT-AC-3 | Cost per successful roadmap counts failed and abandoned pipelines; totals are per currency; conversion only with an explicit rate                         | AT-A-3  |
| AT-AC-4 | Every attempt records model, adapter, prices, `pricingVersion`, reasoning effort, validation result and `fallbackReason`                                  | —       |
| AT-AC-5 | The RFC 0001 cost unit tests (₹11.18388, ₹9.35380) still pass                                                                                             | —       |
| AT-CV-1 | A missing critical requirement triggers exactly one repair                                                                                                | AT-G3-1 |
| AT-CV-2 | Coverage is checked again after the repair; anything still missing returns `degraded` with each requirement named; no second repair                       | AT-G3-2 |
| AT-CV-3 | Missing noncritical requirements succeed with a recorded issue and appear as suggestions                                                                  | —       |
| AT-CV-4 | Prompt 2.0.0 input snapshots for cases 1–4 include every requirement with ID and criticality and no evidence excerpts                                     | AT-G3-3 |
| AT-EV-1 | Evaluation resumes from its run file without repeating completed entries                                                                                  | AT-E-1  |
| AT-EV-2 | Evaluation stops at the quota reserve                                                                                                                     | AT-E-1  |
| AT-EV-3 | Resume fixtures are skipped for free candidates under `deny`                                                                                              | —       |
| AT-EV-4 | Track 1 refuses to start if the chain under test contains a paid entry                                                                                    | —       |
| AT-HR-1 | No eligibility record becomes `approved` without passing metrics and an R1 record with no unacceptable fixture for the same evaluation ID                 | —       |
| AT-HR-2 | The evaluation script writes a blank review template and never writes ratings                                                                             | —       |
| AT-RG-1 | Existing roadmaps, `roadmap_contexts` without `preparationDecision` and generations without `requirementCoverage` load and render                         | AT-G3-4 |
| AT-RG-2 | 2.0.0 output passes the existing roadmap schema and semantic validators                                                                                   | AT-G3-5 |
| AT-RG-3 | Authentication: `/prepare` works for anonymous and signed-in users; generate keeps its auth, CSRF and rate limits; anonymous session adoption still works | —       |
| AT-RG-4 | Resource enrichment tests pass unchanged                                                                                                                  | —       |
| AT-RG-5 | Workspace, adopt and duplicate tests pass; no existing roadmap is regenerated                                                                             | —       |
| AT-RG-6 | Client tests for the generation flow pass with the flag on and off                                                                                        | AT-G2-2 |
| AT-RB-1 | Turning the flag off and restarting restores legacy behaviour with no code change                                                                         | —       |
| AT-RB-2 | A build from `rfc0001-baseline` reads documents written by the new build                                                                                  | —       |
| AT-M-1  | **Live**, track 2: observed calls per case from the report match the case matrix; result recorded here                                                    | AT-M-1  |
| AT-M-2  | **Live**: the one-fixture legacy baseline report exists with real tokens and INR                                                                          | —       |
| AT-M-3  | **Live**: legacy-versus-routed comparison against section 8.4                                                                                             | —       |
| AT-M-4  | **Live**, track 1: per-model metrics against section 8.4 written to `model-eligibility.json`                                                              | AT-M-2  |

## 12. Traceability: approved requirements

| #   | Approved requirement (RFC 0001)                                              | Conflicting change | Tasks                        | Acceptance tests                   | Status                                              |
| --- | ---------------------------------------------------------------------------- | ------------------ | ---------------------------- | ---------------------------------- | --------------------------------------------------- |
| 1   | Resumes never reach free endpoints (5.2, Q8)                                 | 3, 4               | T-14, T-21                   | AT-PV-1 to -5, AT-EV-3             | Implemented; preserved by default                   |
| 2   | Preparation fallback order and eligibility (5, 5.1, 5.3)                     | 1, 2               | T-04, T-11, T-14, T-15, T-16 | AT-FB-1 to -5                      | Implemented in code; `.env` not aligned (T-11)      |
| 3   | Degraded preparation with excerpts, default level and disclosure (8.1, 8.2)  | 5                  | T-05, T-06, T-20             | AT-DG-1 to -5                      | Partly implemented; disclosure UI pending (T-06)    |
| 4   | Legacy pipeline behind its flag until gates pass (3.2, 9.4.5)                | 6                  | T-23, T-24                   | AT-LG-1, AT-LG-2, AT-RB-1          | Implemented; preserved                              |
| 5   | Standalone endpoints kept (11)                                               | 7                  | T-24                         | AT-EP-1, AT-EP-2                   | Present; preserved                                  |
| 6   | Legacy-versus-routed evaluation on equivalent inputs (9.4.4–5)               | 8                  | T-07, T-10                   | AT-M-3, R2                         | Not done; blocked by credit                         |
| 7   | One-fixture legacy cost baseline (9.4.3, Q5)                                 | 9                  | T-08, T-09                   | AT-M-2                             | Not done; blocked by credit                         |
| 8   | Retry counts and timeouts (8, Q3)                                            | 13                 | T-03, T-17                   | AT-RY-1 to -6                      | Code defaults missing (T-03)                        |
| 9   | Startup, catalog failures, recovery (5.1, 5.4)                               | 15, 16             | T-19                         | AT-ST-1 to -5                      | Implemented as RFC 0001; extensions pending D-9     |
| 10  | Accounting, pricing, currency, cost per successful roadmap (9.1, 9.2, 9.4.4) | 18                 | T-08, T-13                   | AT-AC-1 to -5                      | Implemented with gaps (T-13); report pending (T-08) |
| 11  | Critical coverage, one repair, degraded reporting (6.3)                      | 11                 | T-05                         | AT-CV-1 to -4                      | Not done (RFC 0001 step 8)                          |
| 12  | Regression: roadmaps, auth, resources, client/server compatibility (7, 11)   | —                  | T-12                         | AT-RG-1 to -6                      | Existing suites pass; new tests pending             |
| 13  | Rollback and release acceptance (3.2, 9.4.5, 11)                             | 20                 | T-01                         | AT-RB-1, AT-RB-2, section 13 gates | Not tagged; no gate met                             |
| —   | Preparation human review (5.1)                                               | Undecided item B   | T-07                         | AT-HR-1, AT-HR-2                   | Not started                                         |
| —   | Reasoning effort `medium` for generation, `low` for preparation (5)          | Undecided item C   | T-02                         | AT-RE-1 to -3                      | Code defaults missing (T-02)                        |

## 13. Release gates and rollback

### 13.1 Release gates for turning `ai-routed-preparation` on (T-23)

| Gate | Condition                                                                                      | Status  |
| ---- | ---------------------------------------------------------------------------------------------- | ------- |
| RG-1 | All mocked acceptance tests in section 11 for the chosen decisions exist and pass              | Not met |
| RG-2 | A probe file exists for every chain entry in the release configuration                         | Not met |
| RG-3 | Track 1 metrics meet section 8.4 for every preparation entry in the release configuration      | Not met |
| RG-4 | R1 review complete for all nine fixtures, none unacceptable                                    | Not met |
| RG-5 | Legacy baseline reported (AT-M-2)                                                              | Not met |
| RG-6 | Legacy-versus-routed comparison meets section 8.4, and R2 has no fixture judged worse (AT-M-3) | Not met |
| RG-7 | Observed call counts per case recorded (AT-M-1)                                                | Not met |
| RG-8 | Regression suites pass (AT-RG-\*)                                                              | Not met |
| RG-9 | Every decision in section 7 that affects the release configuration is recorded                 | Not met |

RG-5 to RG-7 need AICredits credit.

### 13.2 Rollback

1. **Before any change:** commit and tag `rfc0001-baseline` (T-01, D-12).
2. **Data:** every database change is additive (optional fields, new enum values). Builds before and after can read each other's documents (AT-RB-2), and no migration needs reversing.
3. **Levels, fastest first:**
   1. Turn `ai-routed-preparation` off in `FEATURE_FLAGS`; the legacy pipeline serves every request (AT-RB-1). Available as long as D-4 is not carried out.
   2. Remove a misbehaving model from `AI_MODEL_FAST`.
   3. Set a switch back to its RFC 0001 default (`AI_FREE_PERSONAL_DATA=deny`, `AI_PREPARATION_FAILURE_POLICY=degraded`, `AI_FREE_UNAVAILABLE_POLICY=continue`).
   4. Redeploy the `rfc0001-baseline` tag for client and server together.
4. Existing roadmaps are never regenerated as part of a rollback.

## 14. Approval requested

1. Approval of this revision as the plan of record.
2. The decisions in section 7, at least D-1, D-2, D-3, D-7 and D-12 before phase 1 starts.
3. Go-ahead for phase 0, which RFC 0001 already authorizes.

Until then no code, configuration or compatibility path is changed, no paid call is made, and no gate is marked met.
