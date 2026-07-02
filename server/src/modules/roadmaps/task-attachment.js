import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/app-error.js';

const supportedTypes = new Set(['youtube', 'github', 'pdf', 'google_doc', 'external_url']);

function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('Attachment URL is invalid', {
      status: 422,
      code: 'TASK_ATTACHMENT_URL_INVALID',
    });
  }
  if (url.protocol !== 'https:') {
    throw new AppError('Attachment URLs must use HTTPS', {
      status: 422,
      code: 'TASK_ATTACHMENT_URL_UNSAFE',
    });
  }
  url.hash = '';
  return url;
}

function youtubeId(url) {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    return url.searchParams.get('v') ?? url.pathname.match(/^\/shorts\/([^/]+)/)?.[1] ?? null;
  }
  return null;
}

function githubRepository(url) {
  if (!['github.com', 'www.github.com'].includes(url.hostname)) return null;
  const [owner, repository] = url.pathname.split('/').filter(Boolean);
  return owner && repository ? { owner, repository: repository.replace(/\.git$/i, '') } : null;
}

function googleDocumentId(url) {
  if (!['docs.google.com', 'drive.google.com'].includes(url.hostname)) return null;
  return url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get('id');
}

function metadataFor(type, url) {
  const common = { provider: url.hostname, host: url.hostname, identifier: url.href };
  if (type === 'youtube') {
    const videoId = youtubeId(url);
    if (!videoId)
      throw new AppError('Attachment is not a valid YouTube video URL', {
        status: 422,
        code: 'TASK_ATTACHMENT_PROVIDER_MISMATCH',
      });
    return { ...common, provider: 'YouTube', identifier: videoId, videoId };
  }
  if (type === 'github') {
    const repository = githubRepository(url);
    if (!repository)
      throw new AppError('Attachment is not a valid GitHub repository URL', {
        status: 422,
        code: 'TASK_ATTACHMENT_PROVIDER_MISMATCH',
      });
    return {
      ...common,
      provider: 'GitHub',
      identifier: `${repository.owner}/${repository.repository}`,
      ...repository,
    };
  }
  if (type === 'google_doc') {
    const documentId = googleDocumentId(url);
    if (!documentId)
      throw new AppError('Attachment is not a valid Google document URL', {
        status: 422,
        code: 'TASK_ATTACHMENT_PROVIDER_MISMATCH',
      });
    return { ...common, provider: 'Google Docs', identifier: documentId, documentId };
  }
  if (type === 'pdf') {
    return {
      ...common,
      provider: 'PDF',
      identifier: decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? url.href),
      fileName: decodeURIComponent(
        url.pathname.split('/').filter(Boolean).at(-1) ?? 'Document.pdf',
      ),
    };
  }
  return common;
}

function defaultTitle(type, metadata) {
  const labels = {
    youtube: 'YouTube video',
    github: metadata.identifier,
    pdf: metadata.fileName,
    google_doc: 'Google document',
    external_url: metadata.host,
  };
  return labels[type];
}

export function normalizeTaskAttachments(attachments, existing = []) {
  const existingById = new Map(existing.map((attachment) => [attachment.attachmentId, attachment]));
  const seenUrls = new Set();
  return attachments.map((attachment) => {
    if (!supportedTypes.has(attachment.type)) {
      throw new AppError('Attachment type is unsupported', {
        status: 422,
        code: 'TASK_ATTACHMENT_TYPE_UNSUPPORTED',
      });
    }
    const url = safeUrl(attachment.url);
    if (seenUrls.has(url.href)) {
      throw new AppError('The same attachment cannot be added twice to one task', {
        status: 422,
        code: 'TASK_ATTACHMENT_DUPLICATE',
      });
    }
    seenUrls.add(url.href);
    const previous = existingById.get(attachment.attachmentId);
    const metadata =
      previous?.type === attachment.type && previous?.url === url.href
        ? structuredClone(previous.metadata)
        : metadataFor(attachment.type, url);
    return {
      attachmentId: previous?.attachmentId ?? attachment.attachmentId ?? randomUUID(),
      type: attachment.type,
      url: url.href,
      title: attachment.title?.trim() || defaultTitle(attachment.type, metadata),
      description: attachment.description?.trim() || null,
      metadata,
      createdAt: previous?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
  });
}
