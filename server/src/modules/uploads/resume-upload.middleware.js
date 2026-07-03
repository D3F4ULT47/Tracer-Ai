import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.RESUME_MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 0,
  },
});

export function receiveResumeUpload(request, response, next) {
  upload.single('resume')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      next(
        new AppError('Resume PDF exceeds the configured file-size limit', {
          status: 413,
          code: 'RESUME_FILE_TOO_LARGE',
        }),
      );
      return;
    }

    next(
      new AppError('Resume upload could not be processed', {
        status: 400,
        code: 'INVALID_RESUME_UPLOAD',
      }),
    );
  });
}
