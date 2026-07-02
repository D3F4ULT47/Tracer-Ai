# MVP Completion: Activity, Visibility, and Dynamic Homepage

Status: Implemented  
Scope: Final MVP refinement before live scenario testing

## Activity pipeline

Every roadmap mutation returns one semantic activity descriptor. The roadmap repository persists the
content/version change and its activity event in the same MongoDB transaction. This makes the feed
append-only and prevents successful edits without corresponding history.

```text
User action
  -> Roadmap service classifies the action
  -> Roadmap repository transaction
       -> persist roadmap/version mutation
       -> append exactly one roadmap_activities event
  -> GET /api/v1/activity
  -> authenticated homepage timeline
```

The activity model retains the existing `roadmap_activities` collection. Legacy generated, edited,
duplicated, and deleted rows are presented through compatibility mappings. New events contain a UUID,
user and roadmap identity, roadmap title, semantic event type, entity identity, description, timestamp,
and metadata. Pagination uses an opaque timestamp/activity cursor and supports an optional activity-type
filter for future clients.

## Visibility and publishing

Roadmaps now have `visibility` (`PRIVATE` or `PUBLIC`) and `publishedAt`. Missing visibility on legacy
roadmaps is presented as `PRIVATE`. Generation and duplication remain private by default.

`PATCH /api/v1/roadmaps/:roadmapId/visibility` is authenticated, CSRF-protected, revision-aware, and
owner-scoped. Publishing changes the existing roadmap rather than creating a public copy. Publishing and
unpublishing each append one activity event.

## Community feed

`GET /api/v1/community/feed` is public and chronological. It queries only non-deleted `PUBLIC` roadmaps
with a publication timestamp and returns compact metadata plus the owner's profile name. It performs no
ranking, popularity calculation, recommendation, or AI call.

## Homepage

Recent Activity and Community Feed are TanStack Query consumers. Fabricated roadmaps, users, engagement
numbers, and activity history have been removed. Both sections implement loading, error, retry, data, and
honest empty states. Anonymous visitors receive the activity empty state without an unauthorized request.

## Authentication continuation

Selecting **Sign in to save** records both the preview return location and an automatic-save intent.
Login or verified signup returns to the preview. The preview consumes the intent once, persists the
roadmap, clears temporary preview state, and opens the saved workspace. Failed persistence remains
recoverable through the existing preview retry UI.

## Deployment

Run `npm run migrate:mvp-completion -w @tracer-ai/server` once per environment to create the activity and
public-feed indexes. The migration does not rewrite existing roadmaps or activity documents.
