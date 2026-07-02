import assert from 'node:assert/strict';
import test from 'node:test';
import { getTemporaryFileStore } from '../src/modules/uploads/index.js';

const enabled = process.env.CLOUDINARY_LIVE_TEST === 'true';

test(
  'temporary Cloudinary storage uploads and removes a PDF',
  { skip: !enabled, timeout: 30_000 },
  async () => {
    const store = getTemporaryFileStore();
    const file = await store.upload({ buffer: Buffer.from('%PDF-1.4\n%%EOF') });

    assert.ok(file.publicId);
    await store.remove(file.publicId);
  },
);
