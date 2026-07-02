import { officialDocsCatalog } from './official-docs.catalog.js';
import { resourceCandidate } from './resource-candidate.js';

const ignoredWords = new Set([
  'a',
  'an',
  'and',
  'build',
  'for',
  'in',
  'learn',
  'of',
  'on',
  'the',
  'to',
  'using',
  'with',
]);

function queryTerms(query) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((term) => term.length > 1 && !ignoredWords.has(term)),
    ),
  ];
}

export function createOfficialDocsProvider({ catalog = officialDocsCatalog } = {}) {
  return Object.freeze({
    name: 'official_docs',
    version: '1.0.0',
    rateLimit: { maximum: 1_000, windowMs: 60_000 },
    isEnabled: () => true,
    async search({ query }, { limit = 10 } = {}) {
      const terms = queryTerms(query);
      if (terms.length === 0) return [];
      return catalog
        .filter((entry) => {
          const searchable =
            `${entry.title} ${entry.description} ${entry.tags.join(' ')}`.toLowerCase();
          return terms.some((term) => searchable.includes(term));
        })
        .slice(0, limit);
    },
    normalize(entry, context) {
      return resourceCandidate({
        provider: 'official_docs',
        providerResourceId: entry.id,
        type: 'documentation',
        canonicalUrl: entry.url,
        title: entry.title,
        description: entry.description,
        author: entry.author,
        language: 'English',
        difficulty: context.task.difficulty,
        tags: [context.task.title, ...entry.tags],
        providerMetadata: {
          curated: true,
          official: true,
          approvedDomain: new URL(entry.url).hostname,
          catalogVersion: '1.0.0',
        },
      });
    },
  });
}
