# Sprint 3 Package 3.5 — Roadmap Knowledge Integration

- **Status:** Complete
- **Atomic knowledge unit:** Task
- **Phase and week attachments/notes:** Unsupported by design
- **Roadmap hierarchy:** Unchanged

## Architecture summary

```text
Roadmap Context
  ├── Learning Context
  ├── Source Understanding
  └── Immutable source attribution

Roadmap
  └── Phases
      └── Weeks
          └── Tasks
              ├── Private notes
              └── Contextual attachments
```

Phases and weeks remain organizational containers. Tasks own notes and attachments because they are the atomic execution and future optimization boundary.

## Task attachments

Supported attachment types:

- YouTube
- GitHub
- PDF reference
- Google Doc
- External HTTPS URL

Attachments are embedded in the task and versioned through the existing optimistic-concurrency mutation. Each attachment contains a stable ID, type, canonical HTTPS URL, title, optional description, compact provider metadata, and timestamps.

Provider metadata is derived without fetching arbitrary external pages:

- YouTube video ID
- GitHub owner and repository
- Google document ID
- PDF filename
- External host and canonical URL

This produces compact preview cards while avoiding server-side request-forgery exposure. Duplicate URLs, non-HTTPS URLs, provider/type mismatches, unsupported types, and attempts to attach content to phases or weeks are rejected.

PDF task attachments are HTTPS references. Secure binary PDF ingestion for roadmap generation remains available separately through the Package 3.4 document pipeline.

## Private notes

Task notes remain accessible only through owner-authenticated roadmap APIs. Notes can be added, edited, and removed from the task details panel. Every change uses existing roadmap versioning and protected-content confirmation.

## Roadmap metadata and attribution

The workspace now exposes a compact metadata projection derived from approved stored state:

- Estimated weeks and task hours
- Difficulty
- Generation date
- Current version
- Source types
- Target role

Source attribution remains stored in `roadmap_contexts` and is rendered in the workspace without duplicating it into phases, weeks, or tasks.

## Homepage refinement

The top product label was removed. A layout-preserving spacer keeps the composer, helper text, chips, Recent Activity, and Community Feed at their previous positions while only the title and description are translated into the reclaimed 35px space. Typography, component proportions, responsive breakpoints, and section order are unchanged.

## Package boundary

Package 3.5 does not implement optimization, adaptive AI, sharing, community behavior, collaboration, Learning Circle, tutoring, quizzes, flashcards, or Sprint 4 functionality.
