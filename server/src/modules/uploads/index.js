export { validatePdfUpload } from './pdf-upload.validation.js';
export { getTemporaryFileStore } from './providers/cloudinary-temporary-file-store.js';
export { receiveResumeUpload } from './resume-upload.middleware.js';
export { receiveDocumentUpload } from './document-upload.middleware.js';

export const uploadsModule = Object.freeze({ name: 'uploads', routePrefix: '/uploads' });
