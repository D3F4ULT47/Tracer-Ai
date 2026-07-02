# Sprint 3 UI Data Contract Expectations

**Status:** Design input only — no API, persistence, or business logic is implemented by this document.

These shapes describe the minimum information the existing homepage presentation expects. Sprint 3 must define the official shared contracts before implementing endpoints.

## Community Feed item

```json
{
  "id": "community-item-id",
  "creator": {
    "id": "user-id",
    "displayName": "Maya Chen"
  },
  "roadmap": {
    "id": "roadmap-id",
    "title": "Frontend Engineer in 12 Weeks",
    "description": "React, testing, accessibility, and a production portfolio.",
    "completionPercentage": 72
  },
  "engagement": {
    "likes": 284,
    "forks": 61,
    "bookmarks": 42,
    "views": 1803
  },
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

Presentation expectations:

- Identifiers are stable and opaque.
- Counts are non-negative integers.
- `completionPercentage` is between 0 and 100.
- The server supplies timestamps; the client formats relative time.
- Bookmark and interaction state can be added to the official contract without changing card layout.

## Recent Activity item

```json
{
  "id": "activity-id",
  "type": "phase_completed",
  "user": {
    "id": "user-id",
    "displayName": "Nishchay"
  },
  "roadmap": {
    "id": "roadmap-id",
    "title": "SQL Intermediate"
  },
  "phase": {
    "id": "phase-id",
    "title": "Advanced SELECT Queries"
  },
  "task": {
    "id": "task-id",
    "title": "Window functions and query optimization"
  },
  "status": "completed",
  "timestamp": "2026-07-01T00:00:00.000Z"
}
```

Presentation expectations:

- `phase` and `task` may be `null` when the activity applies to a higher roadmap level.
- Initial activity types should cover `roadmap_started`, `phase_started`, `phase_completed`, and `task_completed`.
- Initial statuses should use existing roadmap vocabulary where possible.
- Ordering and pagination belong to the future server contract; the client should not infer chronology from labels.
- The client derives relative time from `timestamp` and never persists formatted strings.
