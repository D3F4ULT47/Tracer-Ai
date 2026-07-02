# Sprint 3 Package 3.4 — Knowledge Source Intelligence

- **Status:** Complete
- **Product position:** AI-native Roadmap Operating System
- **Roadmap generation algorithm:** Unchanged
- **Community, sharing, collaboration, and optimization:** Not implemented

## Updated architecture

```text
Natural Prompt ─┐
Resume ─────────┤
PDF ────────────┤
GitHub ─────────┤
YouTube ────────┼─→ Roadmap Source handlers
AI Report ──────┤            ↓
Mixed Inputs ───┘   Canonical Roadmap Sources
                              ↓
                    Source Understanding
                              ↓
             Learning Context + Source Understanding
                              ↓
                Existing one-pass Roadmap Planner
                              ↓
                Roadmap Context + Attribution
```

Learning Context continues to represent the learner. Source Understanding represents the supplied knowledge artifacts. Neither object takes ownership of the other.

## Canonical Roadmap Source

Every handler produces the same versioned internal contract:

- Stable source type and generated source ID
- Normalized source content and SHA-256 hash
- Attribution containing identifier, URL, creator, timestamp, and relevant locations
- Extracted headings, sections, repository paths, languages, dependency manifests, and transcript availability where applicable

The modular `SourceHandlerRegistry` allows future source types to be registered without changing the understanding service.

## Supported handlers

- **Natural Prompt:** normalized user intent
- **Resume:** normalized resume evidence with filename/page attribution
- **PDF:** headings, sections, pages, requirements, and milestone evidence after secure PDF extraction
- **GitHub Repository:** repository metadata, README, branch, languages, tree paths, and dependency manifests through the public GitHub API
- **YouTube Video:** official YouTube Data API metadata plus an optional legitimately supplied transcript
- **AI-generated report:** long-form structure and provider attribution when known
- **Mixed inputs:** up to eight independently attributed sources merged into one understanding

YouTube remains configuration-gated by `YOUTUBE_API_KEY`. The implementation does not scrape transcripts. Missing optional GitHub data such as a README or tree degrades independently while core repository metadata remains required.

## Source Understanding

The AI provider receives only canonical sources and returns structured JSON containing:

- Concepts
- Technologies
- Skills
- Prerequisites
- Dependencies
- Milestones
- Creator recommendations
- Preserved source structure
- Evidence
- Explicit assumptions

Every evidence excerpt must exist verbatim in its referenced source. Unknown source IDs, duplicate evidence IDs, unsupported excerpts, and missing evidence references are rejected before the understanding can reach planning.

## Attribution persistence

`roadmap_contexts` now stores:

- The immutable Learning Context
- The immutable Source Understanding
- A compact immutable attribution list

The roadmap continues referencing one Roadmap Context, so source metadata is not duplicated into roadmap phases or tasks. This supports future traceability and regeneration while keeping roadmap JSON clean.

## API and frontend flow

`POST /api/v1/ai/source-understanding` is generated from the shared contract. The current composer calls it between input ingestion and learner assessment, passes the result through clarification, and supplies it to roadmap planning. Anonymous previews retain the understanding so attribution is preserved if the roadmap is saved after sign-in.

`POST /api/v1/ai/inputs/document` provides a separate secure PDF-document ingestion path. It reuses MIME, signature, size, temporary Cloudinary storage, extraction, and cleanup controls without misclassifying project briefs or specifications as résumés. The existing résumé endpoint remains unchanged.

Homepage copy now describes transforming goals, documents, repositories, videos, and AI-generated output into interactive roadmaps. Its layout is unchanged.

## Package boundary

Package 3.4 does not implement community, attachments UI, sharing, collaboration, adaptive optimization, transcript scraping, quizzes, tutoring, or Sprint 4 behavior.
