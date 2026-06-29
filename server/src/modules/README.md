# Feature modules

Each feature module owns its routes, controller, service, validation, persistence, policies, and tests when implementation begins. Modules expose only their public `index.js` contract. No module may import another module's controller, route, model, or private utility.

This scaffold intentionally contains module manifests only. Business files are added one feature at a time so empty controllers, fake models, and dead placeholder logic do not become architecture.
