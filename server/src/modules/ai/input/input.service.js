import { env } from '../../../config/env.js';
import {
  featureFlags,
  reservedFlags,
} from '../../../infrastructure/feature-flags/feature-flag-service.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { getTemporaryFileStore, validatePdfUpload } from '../../uploads/index.js';
import { classifyInput } from './input-classifier.js';
import { extractPdfText } from './pdf-text-extractor.js';
import { normalizeInputText } from './text-normalizer.js';

export function createInputService({
  flags = featureFlags,
  temporaryFileStoreFactory = getTemporaryFileStore,
  pdfExtractor = extractPdfText,
} = {}) {
  async function ingestPdf({ file, ownerId, sourceType }) {
    const enabled = await flags.isEnabled(reservedFlags.RESUME_UPLOAD, { userId: ownerId });
    if (!enabled) {
      const isResume = sourceType === 'resume';
      throw new AppError(isResume ? 'Resume upload is not enabled' : 'PDF upload is not enabled', {
        status: 404,
        code: isResume ? 'RESUME_UPLOAD_DISABLED' : 'PDF_UPLOAD_DISABLED',
      });
    }

    const fileMetadata = validatePdfUpload(file);
    const temporaryFileStore = temporaryFileStoreFactory();
    let temporaryFile;
    let ingestionError;
    let ingestion;

    try {
      temporaryFile = await temporaryFileStore.upload({ buffer: file.buffer });
      const extracted = await pdfExtractor(file.buffer);
      const normalized = normalizeInputText(extracted.text, {
        maximumCharacters: env.RESUME_MAX_EXTRACTED_CHARACTERS,
      });
      const classification = classifyInput({
        text: normalized.text,
        source: sourceType === 'resume' ? 'resume' : 'pdf',
      });
      const isResume = classification.type === 'resume';
      ingestion = Object.freeze({
        inputType: isResume ? 'resume' : 'pdf',
        normalizedText: normalized.text,
        classification,
        metadata: Object.freeze({
          characterCount: normalized.characterCount,
          inputHash: normalized.inputHash,
          fileName: fileMetadata.fileName,
          mimeType: fileMetadata.mimeType,
          sizeBytes: fileMetadata.sizeBytes,
          pageCount: extracted.pageCount,
        }),
      });
    } catch (error) {
      ingestionError = error;
    }

    let cleanupError;
    if (temporaryFile?.publicId) {
      try {
        await temporaryFileStore.remove(temporaryFile.publicId);
      } catch (error) {
        cleanupError = error;
      }
    }

    if (ingestionError) {
      if (cleanupError) {
        logger.warn(
          { err: cleanupError, publicId: temporaryFile.publicId },
          'Temporary PDF cleanup failed after ingestion error',
        );
      }
      throw ingestionError;
    }
    if (cleanupError) throw cleanupError;
    return ingestion;
  }

  return Object.freeze({
    ingestText({ input, declaredType }) {
      const normalized = normalizeInputText(input, { maximumCharacters: 20_000 });
      const classification = classifyInput({
        text: normalized.text,
        declaredType,
      });

      return Object.freeze({
        inputType: classification.type === 'project' ? 'project_description' : 'natural_language',
        normalizedText: normalized.text,
        classification,
        metadata: Object.freeze({
          characterCount: normalized.characterCount,
          inputHash: normalized.inputHash,
        }),
      });
    },

    async ingestResume({ file, ownerId }) {
      return ingestPdf({ file, ownerId, sourceType: 'resume' });
    },

    async ingestDocument({ file, ownerId }) {
      return ingestPdf({ file, ownerId, sourceType: 'pdf' });
    },
  });
}

export const inputService = createInputService();
