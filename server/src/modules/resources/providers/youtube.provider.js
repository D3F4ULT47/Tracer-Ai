import { requestProviderJson } from './provider-http.js';
import { integer, resourceCandidate } from './resource-candidate.js';

const provider = 'youtube';

function durationMinutes(value) {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map((part) =>
    part === undefined ? 0 : Number(part),
  );
  return Math.max(1, Math.ceil(days * 1440 + hours * 60 + minutes + seconds / 60));
}

function thumbnail(snippet) {
  return (
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
    snippet?.thumbnails?.default?.url ??
    null
  );
}

export function createYouTubeProvider({ apiKey, fetcher = fetch, timeoutMs = 8_000 } = {}) {
  return Object.freeze({
    name: provider,
    version: '1.0.0',
    rateLimit: { maximum: 100, windowMs: 60_000 },
    isEnabled: () => Boolean(apiKey),
    async search({ query }, { limit, signal } = {}) {
      if (!apiKey) return [];
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.search = new URLSearchParams({
        part: 'snippet',
        type: 'video,playlist',
        q: query,
        maxResults: String(limit),
        key: apiKey,
        safeSearch: 'strict',
      });
      const search = await requestProviderJson({
        provider,
        url: searchUrl,
        signal,
        timeoutMs,
        fetcher,
      });
      const videoIds = (search.items ?? []).map((item) => item.id?.videoId).filter(Boolean);
      let detailsById = new Map();
      if (videoIds.length > 0) {
        const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        detailsUrl.search = new URLSearchParams({
          part: 'contentDetails,statistics',
          id: videoIds.join(','),
          key: apiKey,
        });
        const details = await requestProviderJson({
          provider,
          url: detailsUrl,
          signal,
          timeoutMs,
          fetcher,
        });
        detailsById = new Map((details.items ?? []).map((item) => [item.id, item]));
      }
      return (search.items ?? []).map((item) => ({
        item,
        details: detailsById.get(item.id?.videoId) ?? null,
      }));
    },
    normalize({ item, details }, context) {
      const videoId = item.id?.videoId;
      const playlistId = item.id?.playlistId;
      const providerResourceId = videoId ?? playlistId;
      const type = videoId ? 'video' : 'playlist';
      return resourceCandidate({
        provider,
        providerResourceId,
        type,
        canonicalUrl: videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : `https://www.youtube.com/playlist?list=${playlistId}`,
        title: item.snippet?.title,
        description: item.snippet?.description || null,
        author: item.snippet?.channelTitle || null,
        language: context.preferredLanguage,
        estimatedDurationMinutes: durationMinutes(details?.contentDetails?.duration),
        difficulty: context.task.difficulty,
        tags: [context.task.title, type],
        thumbnailUrl: thumbnail(item.snippet),
        popularity: {
          views: integer(details?.statistics?.viewCount),
          likes: integer(details?.statistics?.likeCount),
        },
        providerMetadata: {
          channelId: item.snippet?.channelId ?? null,
          publishedAt: item.snippet?.publishedAt ?? null,
          liveBroadcastContent: item.snippet?.liveBroadcastContent ?? null,
        },
      });
    },
  });
}
