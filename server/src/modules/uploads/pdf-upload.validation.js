import { basename } from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

const PDF_MIME_TYPE = 'application/pdf';
const PDF_SIGNATURE = Buffer.from('%PDF-');

export function sanitizeUploadFileName(fileName = 'resume.pdf') {
  const safeBaseName = basename(fileName)
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);

  return safeBaseName || 'resume.pdf';
}

export function validatePdfUpload(file, { maximumBytes = env.RESUME_MAX_FILE_SIZE_BYTES } = {}) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new AppError('A resume PDF is required', {
      status: 400,
      code: 'RESUME_FILE_REQUIRED',
    });
  }

  if (file.mimetype !== PDF_MIME_TYPE) {
    throw new AppError('Resume upload must use the application/pdf MIME type', {
      status: 415,
      code: 'UNSUPPORTED_RESUME_MEDIA_TYPE',
    });
  }

  if (file.buffer.length > maximumBytes) {
    throw new AppError('Resume PDF exceeds the configured file-size limit', {
      status: 413,
      code: 'RESUME_FILE_TOO_LARGE',
    });
  }

  const signatureWindow = file.buffer.subarray(0, Math.min(1_024, file.buffer.length));
  if (signatureWindow.indexOf(PDF_SIGNATURE) === -1) {
    throw new AppError('Resume file signature is not a valid PDF', {
      status: 415,
      code: 'INVALID_PDF_SIGNATURE',
    });
  }

  return Object.freeze({
    fileName: sanitizeUploadFileName(file.originalname),
    mimeType: PDF_MIME_TYPE,
    sizeBytes: file.buffer.length,
  });
}
