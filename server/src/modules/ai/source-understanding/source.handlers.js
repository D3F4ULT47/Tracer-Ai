import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/app-error.js';
import { normalizeInputText } from '../input/text-normalizer.js';
import { validateAiOutput } from '../json.validator.js';
import { requestSourceJson, requestSourceText } from './source-http.js';

const schemaVersion = '1.0.0';

function unique(values, maximum = 200) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))].slice(0, maximum);
}

function headingsFrom(content) {
  return unique(
    content
      .split('\n')
      .filter((line) => /^#{1,6}\s+/.test(line) || /^[A-Z][A-Z0-9 &/+:_-]{3,80}$/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, '')),
  );
}

function sectionsFrom(content) {
  return content
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function canonical({
  type,
  content,
  title,
  url = null,
  creator = null,
  identifier,
  structure,
  now,
}) {
  const normalized = normalizeInputText(content, { maximumCharacters: 300_000 });
  const sourceId = randomUUID();
  const attribution = {
    sourceId,
    sourceType: type,
    identifier,
    title,
    url,
    creator,
    capturedAt: now().toISOString(),
    relevantLocations: structure.relevantLocations ?? [],
  };
  const source = {
    schemaVersion,
    sourceId,
    type,
    content: normalized.text,
    contentHash: normalized.inputHash,
    processingStatus: 'processed',
    attribution,
    structure: {
      headings: structure.headings ?? [],
      sections: structure.sections ?? [],
      paths: structure.paths ?? [],
      languages: structure.languages ?? [],
      dependencies: structure.dependencies ?? [],
      transcriptAvailable: structure.transcriptAvailable ?? false,
    },
  };
  return validateAiOutput('roadmapSource', source);
}

function textHandler(type, defaultTitle) {
  return {
    type,
    async normalize(input, { now }) {
      const headings = headingsFrom(input.content);
      const pageCount = input.metadata.pageCount;
      return canonical({
        type,
        content: input.content,
        title: input.title ?? input.metadata.fileName ?? defaultTitle,
        creator: type === 'ai_report' ? input.metadata.reportProvider : null,
        identifier:
          input.metadata.fileName ??
          `${type}:${createHash('sha256').update(input.content).digest('hex').slice(0, 16)}`,
        structure: {
          headings,
          sections: sectionsFrom(input.content),
          relevantLocations: [
            ...(pageCount
              ? Array.from({ length: pageCount }, (_, index) => ({
                  kind: 'page',
                  value: String(index + 1),
                }))
              : []),
            ...headings.map((heading) => ({ kind: 'section', value: heading })),
          ],
        },
        now,
      });
    },
  };
}

function githubCoordinates(value) {
  const url = new URL(value);
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
  const [owner, repository] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repository) return null;
  return { owner, repository: repository.replace(/\.git$/i, '') };
}

async function optionalRequest(request) {
  try {
    return await requestSourceJson(request);
  } catch {
    return null;
  }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Tracer-AI-Source-Understanding',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function githubHandler({ fetcher, token }) {
  return {
    type: 'github_repository',
    async normalize(input, { now }) {
      const coordinates = githubCoordinates(input.url);
      if (!coordinates) {
        throw new AppError('GitHub repository URL is invalid', {
          status: 422,
          code: 'GITHUB_SOURCE_URL_INVALID',
        });
      }
      const api = `https://api.github.com/repos/${coordinates.owner}/${coordinates.repository}`;
      const common = {
        sourceType: 'github',
        fetcher,
        timeoutMs: env.RESOURCE_DISCOVERY_TIMEOUT_MS,
        headers: githubHeaders(token),
      };
      const repository = await requestSourceJson({ ...common, url: new URL(api) });
      const branch = input.metadata.branch ?? repository.default_branch ?? 'HEAD';
      const [languages, readme, tree] = await Promise.all([
        optionalRequest({ ...common, url: new URL(`${api}/languages`) }),
        optionalRequest({ ...common, url: new URL(`${api}/readme`) }),
        optionalRequest({ ...common, url: new URL(`${api}/git/trees/${branch}?recursive=1`) }),
      ]);
      const readmeText = readme?.content
        ? Buffer.from(readme.content.replace(/\s/g, ''), 'base64').toString('utf8')
        : '';
      const paths = (tree?.tree ?? [])
        .filter((item) => item.type === 'blob')
        .map((item) => item.path);
      const dependencyFiles = paths.filter((path) =>
        /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|go\.mod|pom\.xml|build\.gradle|Cargo\.toml)$/i.test(
          path,
        ),
      );
      const content = [
        repository.name,
        repository.description,
        readmeText,
        `Languages: ${Object.keys(languages ?? {}).join(', ')}`,
        `Repository paths: ${paths.slice(0, 1000).join(', ')}`,
        `Dependency manifests: ${dependencyFiles.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      return canonical({
        type: 'github_repository',
        content,
        title: repository.full_name,
        url: repository.html_url ?? input.url,
        creator: repository.owner?.login ?? coordinates.owner,
        identifier: `${coordinates.owner}/${coordinates.repository}@${branch}`,
        structure: {
          headings: headingsFrom(readmeText),
          sections: sectionsFrom(readmeText),
          paths,
          languages: Object.keys(languages ?? {}),
          dependencies: dependencyFiles,
          relevantLocations: [
            { kind: 'branch', value: branch },
            ...paths.slice(0, 199).map((path) => ({ kind: 'path', value: path })),
          ],
        },
        now,
      });
    },
  };
}

function youtubeId(value) {
  const url = new URL(value);
  if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    return url.searchParams.get('v') ?? url.pathname.match(/^\/shorts\/([^/]+)/)?.[1] ?? null;
  }
  return null;
}

function youtubeHandler({ fetcher, apiKey }) {
  return {
    type: 'youtube_video',
    async normalize(input, { now }) {
      const videoId = youtubeId(input.url);
      if (!videoId) {
        throw new AppError('YouTube video URL is invalid', {
          status: 422,
          code: 'YOUTUBE_SOURCE_URL_INVALID',
        });
      }
      if (!apiKey) {
        throw new AppError('YouTube source understanding is not configured', {
          status: 503,
          code: 'YOUTUBE_SOURCE_NOT_CONFIGURED',
        });
      }
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.search = new URLSearchParams({
        part: 'snippet,contentDetails',
        id: videoId,
        key: apiKey,
      });
      const response = await requestSourceJson({
        sourceType: 'youtube',
        url,
        fetcher,
        timeoutMs: env.RESOURCE_DISCOVERY_TIMEOUT_MS,
      });
      const video = response.items?.[0];
      if (!video) {
        throw new AppError('YouTube video was not found', {
          status: 404,
          code: 'YOUTUBE_SOURCE_NOT_FOUND',
        });
      }
      const transcript = input.metadata.transcript?.trim() ?? '';
      const content = [
        video.snippet?.title,
        video.snippet?.description,
        transcript ? `Transcript\n${transcript}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return canonical({
        type: 'youtube_video',
        content,
        title: video.snippet?.title ?? input.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        creator: video.snippet?.channelTitle ?? null,
        identifier: videoId,
        structure: {
          headings: headingsFrom(transcript),
          sections: sectionsFrom(transcript),
          transcriptAvailable: Boolean(transcript),
          relevantLocations: transcript ? [{ kind: 'timestamp', value: 'transcript' }] : [],
        },
        now,
      });
    },
  };
}

function googleDocumentId(value) {
  const url = new URL(value);
  if (url.hostname.toLowerCase() !== 'docs.google.com') return null;
  return url.pathname.match(/^\/document\/d\/([^/]+)/)?.[1] ?? null;
}

function googleDocumentHandler({ fetcher }) {
  return {
    type: 'google_document',
    async normalize(input, { now }) {
      const documentId = googleDocumentId(input.url);
      if (!documentId) {
        throw new AppError('Google Document URL is invalid', {
          status: 422,
          code: 'GOOGLE_DOCUMENT_SOURCE_URL_INVALID',
        });
      }
      const exportUrl = new URL(`https://docs.google.com/document/d/${documentId}/export`);
      exportUrl.searchParams.set('format', 'txt');
      const content = await requestSourceText({
        sourceType: 'google_document',
        url: exportUrl,
        fetcher,
        timeoutMs: env.RESOURCE_DISCOVERY_TIMEOUT_MS,
      });
      const headings = headingsFrom(content);
      return canonical({
        type: 'google_document',
        content,
        title: input.title ?? 'Google Document',
        url: `https://docs.google.com/document/d/${documentId}/edit`,
        identifier: documentId,
        structure: {
          headings,
          sections: sectionsFrom(content),
          relevantLocations: headings.map((heading) => ({ kind: 'section', value: heading })),
        },
        now,
      });
    },
  };
}

export function registerDefaultSourceHandlers(
  registry,
  { fetcher = fetch, githubToken = env.GITHUB_TOKEN, youtubeApiKey = env.YOUTUBE_API_KEY } = {},
) {
  registry
    .register(textHandler('natural_prompt', 'Natural prompt'))
    .register(textHandler('resume', 'Resume'))
    .register(textHandler('pdf', 'PDF document'))
    .register(textHandler('ai_report', 'AI-generated report'))
    .register(githubHandler({ fetcher, token: githubToken }))
    .register(youtubeHandler({ fetcher, apiKey: youtubeApiKey }))
    .register(googleDocumentHandler({ fetcher }));
  return registry;
}
