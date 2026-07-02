import { requestProviderJson } from './provider-http.js';
import { integer, resourceCandidate } from './resource-candidate.js';

const provider = 'github';

export function createGitHubProvider({ token, fetcher = fetch, timeoutMs = 8_000 } = {}) {
  return Object.freeze({
    name: provider,
    version: '1.0.0',
    rateLimit: { maximum: token ? 30 : 10, windowMs: 60_000 },
    isEnabled: () => true,
    async search({ query }, { limit, signal } = {}) {
      const url = new URL('https://api.github.com/search/repositories');
      url.search = new URLSearchParams({
        q: `${query} in:name,description,readme archived:false`,
        sort: 'stars',
        order: 'desc',
        per_page: String(limit),
      });
      return (
        (
          await requestProviderJson({
            provider,
            url,
            signal,
            timeoutMs,
            fetcher,
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Tracer-AI-Resource-Discovery',
              'X-GitHub-Api-Version': '2022-11-28',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
        ).items ?? []
      );
    },
    normalize(item, context) {
      return resourceCandidate({
        provider,
        providerResourceId: String(item.id),
        type: 'repository',
        canonicalUrl: item.html_url,
        title: item.full_name,
        description: item.description || null,
        author: item.owner?.login ?? null,
        language: item.language ?? null,
        difficulty: context.task.difficulty,
        tags: [context.task.title, ...(item.topics ?? []), item.language].filter(Boolean),
        thumbnailUrl: item.owner?.avatar_url ?? null,
        popularity: {
          stars: integer(item.stargazers_count),
          forks: integer(item.forks_count),
        },
        providerMetadata: {
          defaultBranch: item.default_branch ?? null,
          openIssues: integer(item.open_issues_count),
          license: item.license?.spdx_id ?? null,
          pushedAt: item.pushed_at ?? null,
          archived: Boolean(item.archived),
        },
      });
    },
  });
}
