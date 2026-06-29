# Domain event infrastructure

The event contract and handler registry are framework-neutral. Durable publication will be implemented through a transactional MongoDB outbox with the first event-producing feature. Direct calls from domain services to analytics, notifications, AI memory, or other asynchronous consumers are prohibited.
