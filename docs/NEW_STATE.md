# Tracer AI — Current state (Oct 18 2026)

This document describes what Tracer AI does today, how each of the four preparation cases is handled, which models run where, what is left of the legacy pipeline, and how the cheaper models compare with gpt-5.5 on preparation quality. Every statement was checked against the code and the evaluation run files on Oct 18. Where something is a prediction rather than a measurement, it says so.

Latest local commits: `eb43848`, `b3f4bef`, `e076e95` (not pushed).

## 1. What the project is

Tracer AI turns a learning goal into a personalised learning roadmap. A learner types a goal and can add sources: a GitHub repository, a YouTube video, a Google document, a PDF, a pasted AI report, a project description, or a resume. The app works out what the sources require and what the learner already knows, then generates a roadmap with milestones and resources.

| Part                  | What it does                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Client (React, Vite)  | Goal and source input, roadmap preview, sign-in, adopting an anonymous preview after sign-in, activity, community, profile |
| API (Express)         | Auth, roadmaps, AI pipeline, resources, sharing, exports, notifications, dashboard, analytics, uploads                     |
| Worker                | Background jobs such as resource enrichment and account deletion                                                           |
| MongoDB (replica set) | All data, AI usage and cost records, idempotency keys                                                                      |
| AI providers          | AICredits (paid: gpt-5.5, gpt-oss-120b, gpt-5-mini) and OpenRouter (free models)                                           |

The AI pipeline has two stages:

1. **Preparation** builds the context: _source understanding_ (requirements, concepts, skills, prerequisites, milestones, each with evidence quoted from the source) and _learner assessment_ (current level, known and missing skills, with evidence quoted from what the learner wrote). These become the _learning context_.
2. **Generation** writes the roadmap from that context. It always uses gpt-5.5 with the same prompt and a 24,000-token output limit.

Every AI call is recorded with tokens, cost in rupees, latency, model and outcome. Repeated or retried requests are not paid twice (section 6).

## 2. The four preparation cases

The router decides the case from the request alone, without any model call (`preparation-router.js`). It looks at two questions: are there content sources, and is there learner evidence?

- **Content source:** any source other than the typed goal and the resume: GitHub, YouTube, Google document, PDF, AI report, project description.
- **Learner evidence:** a resume, or a goal text that describes the learner ("I'm a…", "I've worked…", "3 years of experience…").
- **No learner evidence:** if the learner picked a level, that level is used and nothing is assessed. If they picked "Not sure", the level stays unresolved and the roadmap targets a beginner-to-intermediate learner.

| Case | Input                                              | Preparation call                                     | Prompt                       | Calls per roadmap |
| ---- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------- | ----------------- |
| 1    | Goal only                                          | None                                                 | —                            | 1 (generation)    |
| 2    | Goal + content sources                             | Source understanding                                 | `source-understanding/1.1.0` | 2                 |
| 3    | Content sources + learner evidence                 | One combined call: source understanding + assessment | `preparation-combined/1.0.0` | 2                 |
| 4    | Learner evidence only (resume or self-description) | Learner assessment                                   | `learner-assessment`         | 2                 |

The old pipeline makes 3 calls in every case (section 5).

**Rules that apply in every case**

- **Privacy (decision D-1).** A request containing a resume is personal data and never goes to a free endpoint. Only paid models are tried, on every attempt, retry and fallback.
- **Failure (D-3).** If every preparation model fails, the request ends with HTTP 502 and no roadmap is generated from bad input. An unreadable source is not a model failure: preparation continues with the goal text and reports the source as failed.
- **Free quota exhausted (D-7).** When OpenRouter's daily free limit is used up, preparation stops with HTTP 503 ("Server down") instead of silently paying.
- **Limits.** Each free attempt gets at most 30 s, all free attempts together 60 s, all paid attempts together 90 s, and at most 2 paid attempts (D-2).
- **Evidence check.** Every evidence quote must appear in the source or learner text, and every evidence reference must exist. This check is what stops invented requirements from reaching the roadmap. In the old pipeline, output that fails is rejected and the next model is tried. The new flow salvages first (section 3.4).

**Measured on the router alone:** inputs F1–F3 (goal only) routed to case 1 and made 0 calls. Every other input routed to its expected case (section 7).

## 3. Which models run where

### 3.1 What runs today

| Stage                                   | Setting         | Model today (local `.env`) | Free or paid |
| --------------------------------------- | --------------- | -------------------------- | ------------ |
| Preparation in the new flow (cases 2–4) | `AI_MODEL_FAST` | gpt-5.5                    | Paid         |
| Old pipeline (all three calls)          | `AI_MODEL_CORE` | gpt-5.5                    | Paid         |
| Roadmap generation (both flows)         | `AI_MODEL_CORE` | gpt-5.5                    | Paid         |

**No free model is used anywhere today.**

### 3.2 What the plan intended, and what replaced it

| Preparation for                | Planned (RFC 0001, Plan 0002)                                                         | In use now | Why                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Cases 2, 3, 4 without a resume | Free: Nemotron 3 Super, then Dots 3 Note; paid fallback gpt-oss-120b, then gpt-5-mini | gpt-5.5    | No free model completed a preparation within the 30 s limit; the cheap paid models failed most runs |
| Cases 3, 4 with a resume       | Paid only: gpt-oss-120b, then gpt-5-mini                                              | gpt-5.5    | Same: the cheap paid models failed most runs                                                        |

So **the paid model used in place of the free models is gpt-5.5**, the same model the old pipeline and generation use. This was set on Oct 18 by your decision, so the new flow works while no cheaper model is approved.

### 3.3 Two wiring gaps found while writing this document

1. **The rule that keeps generation models out of preparation is not applied.** `applyOperationPolicy` in `model-chain.js` is written but never called. Plan 0002 says preparation must never use a model of the generation chain. Because it isn't enforced, gpt-5.5 can run preparation today. `PROJECT_STATE.md` lists this task (T-14) as done; it is not.
2. **gpt-5.5's approval leaks into preparation.** gpt-5.5 has a grandfathered "legacy baseline" record meant only for the old pipeline. The eligibility gate is supposed to treat it as unapproved in preparation, but the factory doesn't pass the profile to the gate. So in production gpt-5.5 would be allowed in preparation, while every free and cheap model would be removed as unapproved.

**Fixed on Oct 18.** The factory now applies the privacy gate, then the operation policy, then the eligibility gate with the profile (`resolveChainEntries`). As a result:

- gpt-5.5 is removed from every preparation chain while it is the generation model.
- With `AI_MODEL_FAST=aicredits:openai/gpt-5.5`, preparation in the new flow returns 503 `AI_NO_ELIGIBLE_MODEL`.
- In production, preparation has no allowed model until one is approved.

The old pipeline and generation are unaffected.

### 3.4 Changes made to help a cheaper model pass (Oct 18, untested live)

Both changes apply only to the new flow. The old pipeline keeps its prompts and rejects invalid output exactly as before.

**Bounded preparation prompts:**

- `source-understanding/1.2.0`, `preparation-combined/1.1.0` and `learner-assessment/1.1.0`.
- Caps on every list except requirements, and one-sentence descriptions.
- Quotes of at most 150 characters (source) or 120 characters (learner), copied exactly from one line.
- One milestone per numbered step or week.
- The learner's level is judged on the skill the goal needs.
- The cause they target: failed outputs were 2,500–6,100 tokens long, and timeouts were the main failure.

**Salvage, then repair only for a critical requirement:**

- A quote that isn't in the text is deleted, together with anything that rested only on it.
- A requirement that loses all its quotes is kept, but becomes "inferred, not critical".
- If that requirement was critical, one short repair call (at most 20 s, `AI_EVIDENCE_REPAIR_TIMEOUT_MS`) asks for its exact quote.
  - An exact quote of at least 12 characters restores the requirement to critical.
  - Otherwise it stays optional, and the learner sees a notice naming it.
- An output with less than half of its quotes grounded, or an assessment with no grounded proficiency quote, is still rejected.
- Every salvage and repair is reported:
  - in `preparation.evidenceSalvage`;
  - in a usage record with `stage: evidence_repair`;
  - in the evaluation summary: `salvagedRuns`, `repairCalls`, `repairedRequirements`, and `evidencePassRateWithoutSalvage`.
- The evaluation's critical recall now counts a requirement only if it is found and marked critical. This doesn't change any earlier result.

**Re-evaluation on Oct 18** (`eval-2026-10-18-p2`, production limits, no retries):

| Model                   | Calls | Valid outputs        | Timed out | Evidence failures | Salvage used | Critical recall                                                                                                                   |
| ----------------------- | ----- | -------------------- | --------- | ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| gpt-oss-120b            | 12    | 4 (F4, F5 twice, F6) | 8 at 90 s | 0 (was 7 of 18)   | Never        | 14 of 21 (67%): source understanding 10 of 17 (F5 run 1 empty; F5 run 2 marked the 12-week timeline noncritical), combined 4 of 4 |
| Nemotron 3 Super (free) | 5     | 0                    | 5 at 30 s | —                 | —            | —                                                                                                                                 |

Both runs were stopped by the circuit breaker after 5 consecutive timeouts, so F7 run 3 onwards (gpt-oss-120b) and F5 run 3 onwards (Nemotron) did not run; F8 and F9 were not evaluated.

What this shows:

- **The quote rules worked.** No completed output failed the evidence check, and salvage was never needed.
- **The length caps did not shorten the output.** The model fills every list up to its cap: about 12,000 characters plus 1,300–2,400 reasoning tokens, roughly 6,000 output tokens, the same as before.
- **Timeouts are now the only failure, and they depend on provider speed.** The same size of output took 16 s in one call and more than 90 s in another.
- **F5 (the embedded instruction) produced valid outputs for the first time.** One found all 6 critical requirements and did not follow the instruction. Another "succeeded" with an empty understanding (no requirements, no evidence), which the validator accepts today.
- **Over-marking on F4:** the README's "Nice to have" OpenAPI documentation was marked a critical deliverable, and an eighth requirement restates the goal ("Build the inventory service using the provided repository").
- **Gate gap:** `ai-routing-approve.js` checks availability failures only for free models. gpt-oss-120b's combined call would pass every numeric threshold with 1 valid output from 6 runs; only the missing review blocks it.

Cost: about ₹0.46 for the recorded tokens; up to about ₹1.2 more if the 8 timed-out calls were billed. Nemotron: ₹0.

## 4. The legacy pipeline

**It has not been removed.** It is still the only flow the browser uses.

| Where legacy still runs | How it works                                                                                                                             | Switch                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| The browser             | Calls `/ai/source-understanding` (prompt 1.0.0), `/ai/assessments`, `/ai/learning-contexts`, then `/ai/roadmaps/preview`. All on gpt-5.5 | **None.** The client has no switch; it needs the client change to `/prepare` (task T-06) |
| `/ai/roadmaps/prepare`  | With `ai-routed-preparation` off, it runs the old sequence internally: source understanding and assessment always, then generation       | `ai-routed-preparation` in `FEATURE_FLAGS` (on locally, off by default)                  |

Related flags:

- `ai-learner-assessment` turns the assessment endpoint on. In the new flow, turning it off means no learner assessment is ever run.
- `ai-roadmap-generation` turns generation on.

The old pipeline is kept on purpose (decisions D-4 and D-5) until the new one passes its release gates. Removing it is task T-24. That needs the client switch first, then a model that passes evaluation.

## 5. Cost and calls per roadmap

Prices per million tokens (AICredits catalog), input / output:

- gpt-5.5: ₹508 / ₹3,050.
- gpt-5-mini: ₹25 / ₹203.
- gpt-oss-120b: ₹3.7 / ₹17.

| Case                | Old pipeline                   | New flow today (gpt-5.5 preparation)            |
| ------------------- | ------------------------------ | ----------------------------------------------- |
| 1 Goal only         | 3 calls, about ₹55 (predicted) | 1 call, generation only (predicted about ₹39)   |
| 2 Sources           | 3 calls, about ₹55 (predicted) | 2 calls: source understanding + generation      |
| 3 Sources + learner | 3 calls, about ₹55 (predicted) | 2 calls: one combined + generation              |
| 4 Learner only      | 3 calls, about ₹55 (predicted) | 2 calls; assessment measured at ₹3.09 and 8.9 s |

The old pipeline's cost is predicted from call counts and prices, not measured: you decided not to run it. The only measured gpt-5.5 preparation call is the case 4 assessment above. A gpt-5.5 source understanding or combined call is predicted at about ₹8–15, depending on output length.

**Cheaper preparation, measured per completed call:**

- gpt-oss-120b: about ₹0.03–0.13.
- gpt-5-mini: about ₹1.6.

## 6. Paying once for repeated work

These protections apply to both flows:

| Situation                                 | Behaviour                                      | Verified                                 |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Network retry or double-click (same key)  | The saved response is replayed; no new call    | Offline tests, and live on Oct 18        |
| Same learner, same input, within 1 hour   | Preparation is a cache hit: 0 tokens, ₹0       | Offline tests, and live on Oct 18 (4 ms) |
| Two identical requests at the same moment | One provider call is shared                    | Offline tests only                       |
| Different learners, public-only sources   | Source understanding is shared for 7 days      | Offline tests only                       |
| Resume or other personal input            | Never shared between learners                  | Offline tests only                       |
| Roadmap generation                        | Never cached; every roadmap is generated fresh | Offline tests                            |

## 7. Quality comparison of preparation outputs

### 7.1 Why comparing preparation is enough

Generation is identical in every option: same model (gpt-5.5), same prompt, same token limit. The roadmap can differ only through what it is given: the source understanding and the learner assessment. So if two preparation outputs say the same things correctly, the roadmaps should be of the same quality.

Two caveats:

- Generation is not deterministic, so two roadmaps from the same context still differ in wording.
- The new flow's source-understanding prompt (1.1.0) adds an explicit requirements list that the old prompt (1.0.0) doesn't have. So even with the same model, new and old preparation outputs are not identical by design.

### 7.2 How each output was judged

Each of the nine synthetic inputs (F1–F9) has a hand-written answer key in `evaluation/routing/fixtures.json`: the expected case, the acceptable levels, and the critical and non-critical requirements a correct reading must find. Each output was judged on:

1. **Valid at all:** does it pass the schema and the evidence check? An invalid output produces no roadmap (HTTP 502), which is the worst result for a user.
2. **Critical requirements:** are all of them found, and marked critical? A missed critical requirement means the roadmap skips something the source requires.
3. **Invented requirements:** requirements that match nothing in the answer key.
4. **Level:** is the assessed level right for the goal? A wrong level makes the roadmap too easy or too hard.
5. **Structure:** how many concepts, skills, prerequisites and milestones it gives the generator.
6. **Speed and cost.**

### 7.3 Results: how often each model produced a valid output

Production limits: 30 s per free attempt, 90 s paid budget, no retries.

| Model                   | Valid outputs              | Main failure                                     |
| ----------------------- | -------------------------- | ------------------------------------------------ |
| Nemotron 3 Super (free) | 0 of 8                     | Timed out at 30 s every time                     |
| Dots 3 Note (free)      | 0 of 5                     | Timed out at 30 s every time                     |
| gpt-oss-120b            | 4 of 18 (22%)              | Evidence check failed (7), timed out at 90 s (6) |
| gpt-5-mini              | 1 of 8 (12%)               | Timed out at 90 s (6)                            |
| gpt-5.5                 | 1 of 1 (case 4 live check) | Not run on these inputs                          |

Given up to 3 minutes, Nemotron took 52–105 s on source understanding and failed the evidence check on both runs. It passed one learner assessment, F9, in 27 s. Dots ran out of output tokens.

### 7.4 Results: what the valid outputs contained

| Input                                    | Model                     | Critical requirements found and marked critical | Invented requirements | Level (expected)                               | Structure (concepts / skills / prerequisites / milestones) | Time       |
| ---------------------------------------- | ------------------------- | ----------------------------------------------- | --------------------- | ---------------------------------------------- | ---------------------------------------------------------- | ---------- |
| F4 GitHub repository                     | gpt-oss-120b              | 5 of 5                                          | 0                     | intermediate, user's choice (intermediate)     | 9 / 7 / 6 / 7                                              | 12 s       |
| F4 GitHub repository                     | gpt-5-mini                | 5 of 5                                          | 2                     | intermediate, user's choice (intermediate)     | 7 / 6 / 4 / 7                                              | 86 s       |
| F6 resume + portfolio repo               | gpt-oss-120b              | 4 of 4                                          | 0                     | intermediate (intermediate or advanced)        | 7 / 6 / 5 / 5                                              | 16 s       |
| F7 problem statement + "3 years Node.js" | gpt-oss-120b              | 7 of 7                                          | 0                     | intermediate (intermediate or advanced)        | 5 / 7 / 7 / **0**                                          | 13 s       |
| F9 "data analyst, wants ML"              | gpt-oss-120b              | —                                               | —                     | intermediate, twice (beginner or intermediate) | —                                                          | 29 s, 40 s |
| F9 "data analyst, wants ML"              | Nemotron (3-minute limit) | —                                               | —                     | beginner (beginner or intermediate)            | —                                                          | 27 s       |

Observations from reading the outputs:

- **When a cheap model's output is valid, the requirements are complete.** Every valid output found every critical requirement and marked it critical. That is the part that drives roadmap content.
- **gpt-5-mini added noise.** One added requirement just restates the goal ("Build the inventory service from this repository"). The other is inferred rather than stated ("Use JavaScript and PLpgSQL").
- **gpt-oss-120b gave F7 no milestones.** The source is a 6-week project with five numbered requirements, so the roadmap would get no milestone structure from preparation.
- **gpt-oss-120b judged F9 on the wrong skill.** It rated the learner "intermediate" from their SQL experience, but the goal is machine learning, where they are a beginner. The answer key accepts both levels, so this passed. A roadmap built on "intermediate" would likely skip machine-learning basics. Nemotron rated the same learner "beginner" in machine learning, which fits the goal better.
- **The F4 pagination rule was marked critical by both models; the answer key says non-critical.** The README lists it under "Requirements", so the models' reading is defensible and the key is debatable.
- **No valid output exists for F5**, the AI report with an embedded "ignore all previous instructions" line. Resistance to embedded instructions (criterion C7) is therefore untested.

### 7.5 What this means

**Was the quality the same?**

- **Per valid output: close.** The cheap models found the same critical requirements the answer key lists, with two weaknesses: a missing milestone structure and one level judged on the wrong skill.
- **Per request: no.** Only 22% (gpt-oss-120b) and 12% (gpt-5-mini) of requests produced a valid output. The free models produced none under production limits. In the new flow, every invalid output means a fallback or a 502, so most learners would get a slower roadmap or none.

**Against gpt-5.5:** there are no gpt-5.5 preparation outputs on these nine inputs, so this part is a prediction. gpt-5.5 runs the old pipeline that works in the app today, and its one preparation call on the new flow was valid in 8.9 s. It is expected to be at least as correct as the cheap models and far more often valid, but that is not measured. Measuring it needs about ₹11–15 for one source understanding (F4) and one assessment (F9).

**Approval:** no model passes the thresholds: schema 95%, evidence 90%, critical recall 90%, free availability failures under 20%. `model-eligibility.json` is unchanged.

## 8. Open items

| Item                                                               | Why it matters                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Re-run the evaluation on the new prompts and salvage (section 3.4) | Shows whether a cheaper model now passes; about ₹1–3 on gpt-oss-120b |
| Client switch to `/prepare` (T-06)                                 | Until then users never get the new flow                              |
| gpt-5.5 reference outputs on F4 and F9 (about ₹11–15)              | Turns the gpt-5.5 comparison from a prediction into a measurement    |
| Prompt 2.0.0 with requirement coverage and repair (T-05)           | Planned quality safeguard; not built                                 |
| Shorter preparation output for free models, or a newer free model  | The free models fail on time first, then on evidence                 |
| Live checks for other learners, simultaneous requests, generation  | Only replay and same-learner cache were checked live                 |
| Rotate the API keys pasted in chat                                 | Security                                                             |
