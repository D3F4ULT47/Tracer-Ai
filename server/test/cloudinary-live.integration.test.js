import assert from 'node:assert/strict';
import test from 'node:test';
import { getTemporaryFileStore } from '../src/modules/uploads/index.js';
import { createLiveTestGate } from './support/live-test-gate.js';

const gate = createLiveTestGate({
  name: 'Cloudinary',
  requiredEnvironment: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
});

test(
  'temporary Cloudinary storage uploads and removes a PDF',
  { skip: gate.skipReason, timeout: 30_000 },
  async () => {
    const store = getTemporaryFileStore();
    const file = await store.upload({ buffer: Buffer.from('%PDF-1.4\n%%EOF') });

    assert.ok(file.publicId);
    await store.remove(file.publicId);
  },
);
