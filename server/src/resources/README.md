# Resource infrastructure

Resource providers register through the adapter registry and normalize provider data into shared resource contracts.

Package 3.1 providers are YouTube Data API v3 (configuration-gated), GitHub public REST search, and an approved in-repository official-documentation catalog. Automated general blog discovery is intentionally excluded by ADR RES-2.

The public registry remains outside the resources domain so later parsing adapters can share the same replaceable boundary. Discovery orchestration, validation, persistence, and provider implementations are owned by `modules/resources`.
