# Sprint 3 Package 3.2 — Learning Intelligence Engine

- **Status:** Complete
- **Input:** Learning Context, one roadmap task, and discovered canonical resources
- **Output:** Deterministically ranked candidates
- **HTTP endpoints:** None
- **Assignment and UI:** Deferred

## Ranking architecture

```text
Learning Context + Task + Discovered Resources
                    ↓
             Input validation
                    ↓
          Modular scoring registry
                    ↓
      Intrinsic + learner-relative signals
                    ↓
           Versioned weight profile
                    ↓
       Stable deterministic ordering
                    ↓
           Ranked candidate list
```

`resourceRankingService.rank()` is an internal service interface. It does not inspect resumes, prompts, profiles, or roadmap documents directly.

## Scoring model

Every candidate retains each score independently on a 0–100 scale:

- Authority
- Freshness
- Popularity
- Difficulty match
- Learning-style match
- Preferred-platform match
- Language match
- Estimated-time match
- Completeness
- Provider confidence
- Goal match
- Budget match
- Intrinsic quality

Overall ranking version `1.0.0` uses:

| Signal               | Weight |
| -------------------- | -----: |
| Authority            |    16% |
| Difficulty match     |    16% |
| Learning-style match |    10% |
| Preferred platform   |     8% |
| Language             |     8% |
| Estimated time       |     8% |
| Popularity           |     7% |
| Goal match           |     7% |
| Freshness            |     6% |
| Completeness         |     5% |
| Budget               |     5% |
| Provider confidence  |     4% |

Intrinsic quality is stored separately and combines authority, freshness, popularity, completeness, and provider confidence. It is not included again in the overall score, avoiding double-counting.

## Canonical versus learner-specific state

Reusable Resource fields persist only intrinsic signals:

- `authorityScore`
- `freshnessScore`
- `popularityScore`
- `completenessScore`
- `providerConfidenceScore`
- `qualityScore`
- `qualityScoringVersion`

Difficulty, style, platform, language, time, goal, and budget matches remain in the ranked candidate. They are never written onto the canonical Resource because the same resource may rank differently for every learner.

## Resource types

The normalized contract supports video, playlist, documentation, repository, course, project, reference, and article resources. Package 3.1 providers continue producing only the types they can verify.

## Failure recovery

A failed scoring rule degrades only that signal to a neutral score and records its name in internal reasoning metadata. Failure to persist reusable quality metadata does not discard the ranked result. Stable tie-breaking uses overall score, intrinsic quality, canonical URL, then resource ID.

## Package boundary

Package 3.2 does not assign resources, modify roadmaps, expose ranking over HTTP, render recommendations, or implement community, optimization, activity, or Package 3.3 functionality.
