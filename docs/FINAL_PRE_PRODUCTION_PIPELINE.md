# Final Pre-production Generation Pipeline

Status: FINAL  
Scope: Compatibility refinement after Sprint 3.6

## Architecture

Tracer AI treats one generation request as a bounded collection of independent sources. The
existing `sourceUnderstanding` artifact is the canonical understanding; its persisted name remains
unchanged to preserve contracts and stored roadmaps.

```text
Composer text + uploaded PDF
              |
              v
        Input Sources[]
        - prompt
        - resume
        - PDF
        - GitHub repository
        - YouTube video
        - public Google Document
        - AI report
              |
              v
  Independent source normalization
              |
              v
 Canonical Source Understanding
  - deduplicated insights
  - evidence and attribution
  - confidence and assumptions
  - preserved source structure
              |
              +-------------------+
              |                   |
              v                   v
       Learner Assessment   Learning Context
              |                   |
              +---------+---------+
                        v
               Clarification policy
                        |
                        v
              Complete roadmap planning
                        |
                        v
          Semantic and dependency validation
                        |
                        v
             Deterministic resource pipeline
       discovery -> ranking -> assignment -> attach
                        |
                        v
              Version 1 persistence
                        |
                        v
              Interactive workspace
```

The roadmap planner receives Learning Context and Canonical Source Understanding. It never receives
raw uploaded files, unparsed repository responses, or unnormalized composer input.

## Source processing

- The client separates supported GitHub, YouTube, and Google Document URLs from surrounding prompt
  text without discarding the objective.
- Duplicate URLs within a request are removed.
- Uploaded PDFs are classified deterministically as either resumes or general PDFs after extraction.
- Every accepted source enters Source Understanding with `processingStatus: ready`.
- Every normalized canonical source has `processingStatus: processed`.
- Source normalization is failure-isolated. If one external source is unavailable, its status and a
  sanitized error code are returned while the remaining valid sources continue.
- Generation stops only when no source can be processed.
- Canonical merging remains evidence-grounded and preserves attribution, confidence, assumptions,
  meaningful document structure, and explicit source sequences.

## Backward compatibility

- Existing ingestion, Source Understanding, Learning Context, roadmap planning, and workspace
  endpoints remain available.
- Existing collection names and persisted roadmap structures are unchanged.
- Previously generated roadmaps remain valid.
- `sourceUnderstanding` remains the stored field name and is now explicitly the canonical source
  artifact.
- The legacy `ai_runs.inputType` field remains telemetry-only. Multi-source runs record `combined`;
  no planning decision depends on this field.
- Existing single-source requests remain valid because `processingStatus` defaults to `ready` on the
  server.
- Resource discovery and ranking algorithms are unchanged and continue operating on generated tasks.

## Operational boundaries

- Google Document ingestion supports publicly readable documents through Google's text-export URL.
  A private or unavailable document is reported as a failed source and does not block other sources.
- The source request remains capped at eight sources to bound provider input, latency, and cost.
- OpenAI remains responsible for canonical semantic merging and roadmap generation. Resource ranking
  remains deterministic.

## Verification matrix

Automated coverage verifies:

- prompt-only source construction;
- prompt + GitHub + YouTube source separation;
- prompt + resume + GitHub + YouTube orchestration;
- resume-shaped PDF and general-PDF classification;
- public Google Document normalization;
- independent normalization followed by one canonical merge;
- partial external-source failure without pipeline failure;
- canonical understanding reaching planning and persistence;
- multi-source AI runs recorded as `combined`;
- roadmap validation, resource attachment, workspace contracts, editing, notes, and attachments through
  the complete regression suite.

Live OpenAI, Cloudinary, GitHub, YouTube, and MongoDB verification remains an environment-level test
performed with configured credentials; it does not require another architecture change.
