import { resourceAdapterRegistry } from '../../resources/adapter-registry/resource-adapter-registry.js';
import { createResourceDiscoveryService } from './resource-discovery.service.js';
import { registerResourceProviders } from './resource.providers.js';
import { resourceRankingService } from './ranking/resource-ranking.service.js';
import { learningExperienceService } from './assignment/learning-experience.service.js';
import { createRoadmapResourceEnrichmentService } from './roadmap-resource-enrichment.service.js';

registerResourceProviders();

export const resourceDiscoveryService = createResourceDiscoveryService({
  registry: resourceAdapterRegistry,
});

export const roadmapResourceEnrichmentService = createRoadmapResourceEnrichmentService({
  discovery: resourceDiscoveryService,
  ranking: resourceRankingService,
  assignment: learningExperienceService,
});

export const resourcesModule = Object.freeze({
  name: 'resources',
  routePrefix: null,
  discovery: resourceDiscoveryService,
  ranking: resourceRankingService,
  assignment: learningExperienceService,
  enrichment: roadmapResourceEnrichmentService,
});

export { createResourceDiscoveryService } from './resource-discovery.service.js';
export { createResourceRepository } from './resource.repository.js';
export {
  createResourceRankingService,
  resourceRankingService,
} from './ranking/resource-ranking.service.js';
export {
  createLearningExperienceService,
  learningExperienceService,
} from './assignment/learning-experience.service.js';
export { createRoadmapResourceEnrichmentService } from './roadmap-resource-enrichment.service.js';
