import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.RESUME_MAX_FILE_SIZE_BYTES, files: 1, fields: 0 },
});

export function receiveDocumentUpload(request, response, next) {
  upload.single('document')(request, response, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError('Document PDF exceeds the configured file-size limit', {
          status: 413,
          code: 'DOCUMENT_FILE_TOO_LARGE',
        }),
      );
    }
    return next(
      new AppError('Document upload could not be processed', {
        status: 400,
        code: 'INVALID_DOCUMENT_UPLOAD',
      }),
    );
  });
}
