# Sprint 3 Package 3.3 — Learning Experience Engine

- **Status:** Complete
- **Input:** Learning Context, complete roadmap, and ranked candidates for every task
- **Output:** A validated assignment plan and an enriched roadmap copy
- **HTTP endpoints:** None
- **UI and task assignment persistence:** Deferred

## Assignment architecture

```text
Learning Context + Roadmap + Ranked Candidates
                       ↓
                Input validation
                       ↓
          Exact task-to-candidate mapping
                       ↓
       Budget and time preference safeguards
                       ↓
      Purpose-aware deterministic assignment
                       ↓
        JSON Schema output validation
                       ↓
             Roadmap task enrichment
```

`learningExperienceService.assign()` creates the versioned assignment plan.
`learningExperienceService.enrich()` returns that plan together with a cloned roadmap whose existing hierarchy is unchanged. The service does not discover or rerank resources.

## Learning Experience model

Every task assignment contains:

- A learning objective derived from the existing task description
- Estimated completion time from the existing task estimate
- Existing completion criteria
- One required primary resource link
- Up to two format-diverse alternative links
- Optional practice, reference, and project links when ranked candidates support those roles
- A lightweight knowledge check, mini-deliverable, reflection, or project milestone placeholder
- Optional mini-project metadata for practical tasks
- Assignment schema version `1.0.0`

The engine reduces alternatives to one when the learner has five or fewer weekly hours. Paid resources are excluded whenever suitable free or mixed-access candidates exist, unless the learner has an explicit positive budget or permits paid resources.

## Resource linkage model

Roadmap tasks store compact references only:

```json
{
  "resourceId": "canonical-resource-uuid",
  "purpose": "primary",
  "sourceRank": 1,
  "rankingVersion": "1.0.0"
}
```

Titles, URLs, descriptions, provider metadata, and quality signals remain exclusively in the canonical `resources` collection. A canonical resource may be reused across many tasks and roadmaps. The same resource cannot occupy multiple roles within one task.

## Determinism and failure recovery

Assignment preserves Package 3.2 rank order and uses stable resource-ID tie-breaking. Type selection is role assignment, not reranking. Optional roles degrade independently when no suitable candidate exists. A missing primary candidate fails the entire operation before an enriched roadmap is returned, preventing partially actionable roadmaps.

## Package boundary

Package 3.3 adds no public endpoint, UI rendering, discovery, ranking, community, bookmark, activity-feed, optimization, or workspace behavior. The proposed Package 3.4 Resource Validation and Continuous Refresh direction remains a later package and is not implemented here.
