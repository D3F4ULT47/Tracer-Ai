# Sprint 3 Package 3.6 — End-to-End Resource Integration

- **Status:** Complete
- **Additional AI calls for resources:** None
- **Ranking:** Existing deterministic engine
- **Execution:** Synchronous within complete roadmap generation
- **Failure policy:** Resource enrichment never fails roadmap generation

## End-to-end pipeline

```text
User Input
    ↓
Source Understanding + Learning Context
    ↓
One-pass AI Roadmap Generation
    ↓
Roadmap and dependency validation
    ↓
For each task (maximum concurrency: 3)
    ├── Resource Discovery
    ├── Deterministic Ranking
    ├── Learning Experience Assignment
    └── Canonical resource linkage
    ↓
Attach compact resource references and metadata
    ↓
Persist enriched Roadmap Version 1
    ↓
Return the complete roadmap
```

Enrichment occurs after the AI roadmap has passed schema and semantic validation but before initial persistence. This preserves one meaningful Version 1 instead of creating a resource-only Version 2.

## Automatic task resources

Each task receives a primary resource when discovery returns a usable candidate. The integration may also attach:

- One alternative resource
- One authoritative documentation/reference resource
- One GitHub repository

Optional resources require a deterministic overall score of at least 60. Duplicate canonical resources are not attached twice. No placeholders are created.

Each task stores compact resource links containing resource ID, purpose, source rank, and ranking version. The task attachment stores display metadata and a canonical URL while the full reusable resource remains in the `resources` collection.

## Quick Mode

Quick Mode does not invoke clarification and does not expose proficiency selection. Resource ranking receives safe defaults only when values are unresolved:

- English language
- Beginner proficiency
- Balanced format
- Zero budget
- Free-resource constraint

Paid resources are removed before ranking when Quick Mode has suitable free or mixed-access resources. No questionnaire fields were added.

## Personalized Mode

The existing Learning Context is passed unchanged to ranking. Proficiency, language, platform, learning style, weekly commitment, budget, and other approved preferences continue to influence the existing scoring rules.

## Failure isolation

- A provider failure is already isolated by the discovery registry.
- A complete discovery, persistence, ranking, or assignment failure affects only that task.
- Empty discovery leaves the task without automatic attachments.
- A package-level enrichment failure returns and persists the valid roadmap without resources.
- Resource failures are logged without triggering another OpenAI request.

## Persistence and presentation

Automatic resources and attachments are included in the initial roadmap document and immutable Version 1 snapshot. Enrichment diagnostics are stored in generation parameters. The same complete roadmap is returned synchronously.

Anonymous previews render compact read-only resource links. Authenticated workspaces retain Package 3.5 controls for removing or replacing automatic resources and adding personal links.

## Package boundary

Package 3.6 adds no community, sharing, forking, adaptive optimization, Learning Circle, notifications, quizzes, tutors, flashcards, certifications, or Sprint 4 functionality.
