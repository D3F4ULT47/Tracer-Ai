import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/app-error.js';

export function createCloudinaryTemporaryFileStore({ client, folder } = {}) {
  const cloudinaryClient = client ?? cloudinary;
  const temporaryFolder = folder ?? env.CLOUDINARY_TEMP_FOLDER;

  return Object.freeze({
    async upload({ buffer }) {
      return new Promise((resolve, reject) => {
        const stream = cloudinaryClient.uploader.upload_stream(
          {
            resource_type: 'raw',
            type: 'authenticated',
            folder: temporaryFolder,
            public_id: randomUUID(),
            overwrite: false,
            tags: ['temporary', 'resume'],
          },
          (error, result) => {
            if (error || !result?.public_id) {
              reject(
                new AppError('Temporary resume upload failed', {
                  status: 502,
                  code: 'TEMPORARY_UPLOAD_FAILED',
                }),
              );
              return;
            }

            resolve(
              Object.freeze({
                publicId: result.public_id,
                bytes: result.bytes,
                format: result.format,
              }),
            );
          },
        );

        stream.end(buffer);
      });
    },

    async remove(publicId) {
      const result = await cloudinaryClient.uploader.destroy(publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        invalidate: true,
      });

      if (!['ok', 'not found'].includes(result?.result)) {
        throw new AppError('Temporary resume cleanup failed', {
          status: 502,
          code: 'TEMPORARY_CLEANUP_FAILED',
        });
      }
    },
  });
}

let temporaryFileStore;

export function getTemporaryFileStore() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError('Resume upload is not configured', {
      status: 503,
      code: 'RESUME_UPLOAD_NOT_CONFIGURED',
    });
  }

  if (!temporaryFileStore) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    temporaryFileStore = createCloudinaryTemporaryFileStore();
  }

  return temporaryFileStore;
}
