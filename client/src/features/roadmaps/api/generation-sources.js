const supportedSourceLimit = 8;
const urlPattern = /https?:\/\/[^\s<>"']+/gi;

function cleanUrl(value) {
  return value.replace(/[),.;!?\]}]+$/g, '');
}

function sourceTypeForUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (['github.com', 'www.github.com'].includes(host)) return 'github_repository';
  if (host === 'docs.google.com' && /^\/document\/d\/[^/]+/.test(url.pathname)) {
    return 'google_document';
  }
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    return 'youtube_video';
  }
  return null;
}

function textSources(value) {
  const structure = value.match(/(^|\n)(?:#{1,6}\s+|phase\s+\d+|step\s+\d+)/im);
  if (value.length <= 1_500 || !structure) return [{ type: 'natural_prompt', content: value }];

  const structureStart = structure.index + (structure[1]?.length ?? 0);
  const prompt = value.slice(0, structureStart).trim();
  const report = value.slice(structureStart).trim();
  return [
    ...(prompt ? [{ type: 'natural_prompt', content: prompt }] : []),
    { type: 'ai_report', content: report },
  ];
}

function fileSource(ingestion) {
  return {
    type: ingestion.inputType,
    content: ingestion.normalizedText,
    url: null,
    title: ingestion.metadata.fileName,
    processingStatus: 'ready',
    metadata: {
      fileName: ingestion.metadata.fileName,
      pageCount: ingestion.metadata.pageCount,
    },
  };
}

export function buildGenerationSources({ text, fileIngestions = [] }) {
  const urlSources = [];
  const seenUrls = new Set();
  const remainingText = text.replace(urlPattern, (match) => {
    const url = cleanUrl(match);
    const type = sourceTypeForUrl(url);
    if (!type) return match;
    const key = `${type}:${url}`;
    if (!seenUrls.has(key)) {
      seenUrls.add(key);
      urlSources.push({
        type,
        content: null,
        url,
        title: null,
        processingStatus: 'ready',
        metadata: {},
      });
    }
    return ' ';
  });

  const content = remainingText
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sources = [
    ...(content
      ? textSources(content).map((source) => ({
          ...source,
          url: null,
          title: null,
          processingStatus: 'ready',
          metadata: {},
        }))
      : []),
    ...urlSources,
    ...fileIngestions.filter(Boolean).map(fileSource),
  ];

  if (sources.length === 0) {
    throw new Error('At least one supported roadmap source is required.');
  }
  if (sources.length > supportedSourceLimit) {
    throw new Error(`A roadmap can use up to ${supportedSourceLimit} input sources at once.`);
  }
  return sources;
}
