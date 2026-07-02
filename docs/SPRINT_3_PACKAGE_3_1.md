# Sprint 3 Package 3.1 — Resource Discovery Engine

- **Status:** Complete
- **Scope:** Internal discovery service only
- **HTTP endpoints:** None
- **Ranking and assignment:** Deferred to Packages 3.2 and 3.3

## Discovery architecture

```text
Task + Learning Context
        ↓
Validated discovery query
        ↓
Resource provider registry
        ↓
YouTube | GitHub | Curated Official Documentation
        ↓
Provider isolation + normalization
        ↓
Shared JSON Schema validation
        ↓
Canonical URL deduplication
        ↓
Reusable Resource persistence
```

Resources are independent knowledge entities. They do not contain roadmap or task ownership. Package 3.3 will introduce separate task-resource assignments, allowing one resource to serve many roadmaps without duplication.

The canonical type vocabulary is forward-compatible with video, playlist, documentation, repository, course, project, reference, and article resources. Package 3.1 providers emit only verified types.

## Internal service API

```js
await resourceDiscoveryService.discover({
  task: { title, description, difficulty },
  learningContext,
});
```

The result contains normalized persisted resources and provider diagnostics. A disabled or failed provider does not prevent healthy providers from returning candidates. This interface is intentionally not mounted as an Express route.

## Providers

- **YouTube:** YouTube Data API v3. Enabled only when `YOUTUBE_API_KEY` is configured. Search results are enriched with video duration and public statistics.
- **GitHub:** Public REST repository search. `GITHUB_TOKEN` is optional and raises provider rate limits.
- **Official documentation:** Deterministic search over an explicitly approved catalog including MDN, React, Node.js, Python, Docker, Git/GitHub, AWS, Kubernetes, MongoDB, Express, Microsoft Learn, and TypeScript.
- **Blogs:** Automated blog search is excluded by ADR RES-2.

## Configuration

```dotenv
YOUTUBE_API_KEY=
GITHUB_TOKEN=
RESOURCE_DISCOVERY_TIMEOUT_MS=8000
RESOURCE_DISCOVERY_MAX_RESULTS_PER_PROVIDER=10
```

Missing optional provider credentials degrade only that provider. Secrets never enter resource metadata or logs.

## Persistence and deduplication

The `resources` collection uses stable UUIDs and unique indexes on canonical URL hash and provider identity. Tracking parameters are removed before hashing. Metadata refreshes update the existing entity rather than creating task-specific copies.

Production index creation is versioned in migration `002-create-resource-indexes` and can be invoked with `npm run migrate:sprint-3 -w @tracer-ai/server`. The migration is not executed automatically by application startup.

## Package boundary

Package 3.1 does not rank, recommend, assign, expose, or render resources. It does not modify roadmaps, authentication, AI generation, community features, or the workspace.
