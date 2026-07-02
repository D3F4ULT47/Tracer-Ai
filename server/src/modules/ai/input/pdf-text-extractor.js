import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/app-error.js';

export async function extractPdfText(buffer, { maximumPages = env.RESUME_MAX_PDF_PAGES } = {}) {
  let loadingTask;
  let document;

  try {
    loadingTask = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      stopAtErrors: true,
      useSystemFonts: true,
    });
    document = await loadingTask.promise;

    if (document.numPages > maximumPages) {
      throw new AppError('Resume PDF exceeds the configured page limit', {
        status: 413,
        code: 'RESUME_PAGE_LIMIT_EXCEEDED',
      });
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      page.cleanup();
    }

    const text = pages.join('\n\n');
    if (!text.trim()) {
      throw new AppError('Resume PDF does not contain extractable text', {
        status: 422,
        code: 'RESUME_TEXT_NOT_EXTRACTABLE',
      });
    }

    return Object.freeze({ text, pageCount: document.numPages });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Resume PDF could not be parsed', {
      status: 422,
      code: 'INVALID_PDF_DOCUMENT',
    });
  } finally {
    if (typeof document?.cleanup === 'function') await document.cleanup();
    if (typeof loadingTask?.destroy === 'function') await loadingTask.destroy();
  }
}
