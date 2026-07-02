import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';
import { classifyInput } from '../src/modules/ai/input/input-classifier.js';
import { createInputService } from '../src/modules/ai/input/input.service.js';
import { extractPdfText } from '../src/modules/ai/input/pdf-text-extractor.js';
import { normalizeInputText } from '../src/modules/ai/input/text-normalizer.js';
import { validatePdfUpload } from '../src/modules/uploads/pdf-upload.validation.js';
import { createCloudinaryTemporaryFileStore } from '../src/modules/uploads/providers/cloudinary-temporary-file-store.js';

function createPdf(text = 'Tracer AI Resume') {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

test('deterministic classifier distinguishes supported input categories', () => {
  assert.equal(classifyInput({ text: 'I want to become a product manager.' }).type, 'career_goal');
  assert.equal(classifyInput({ text: 'I want to build a SaaS application.' }).type, 'project');
  assert.equal(classifyInput({ text: 'Teach me database indexing.' }).type, 'learning_goal');
  assert.equal(classifyInput({ text: 'ignored', source: 'resume' }).type, 'resume');
  assert.equal(
    classifyInput({
      text: 'EXPERIENCE\nFrontend internship\nSKILLS\nReact\nEDUCATION\nB.Tech',
      source: 'pdf',
    }).type,
    'resume',
  );
  assert.equal(
    classifyInput({ text: 'PROJECT REQUIREMENTS\nBuild an API', source: 'pdf' }).type,
    'pdf',
  );
});

test('text normalization removes control noise and creates a stable hash', () => {
  const first = normalizeInputText('  Learn\tSQL\r\n\r\n\r\nNow\u0000  ');
  const second = normalizeInputText('Learn SQL\n\nNow');

  assert.equal(first.text, 'Learn SQL\n\nNow');
  assert.equal(first.inputHash, second.inputHash);
  assert.match(first.inputHash, /^[a-f0-9]{64}$/);
});

test('resume upload validation checks MIME, signature, size, and filename', () => {
  const buffer = createPdf();
  const valid = validatePdfUpload(
    {
      buffer,
      mimetype: 'application/pdf',
      originalname: '../../My Resume (final).pdf',
    },
    { maximumBytes: buffer.length + 1 },
  );

  assert.equal(valid.fileName, 'My-Resume-final.pdf');
  assert.throws(
    () =>
      validatePdfUpload({
        buffer,
        mimetype: 'text/plain',
        originalname: 'resume.pdf',
      }),
    (error) => error.code === 'UNSUPPORTED_RESUME_MEDIA_TYPE',
  );
  assert.throws(
    () =>
      validatePdfUpload({
        buffer: Buffer.from('not a pdf'),
        mimetype: 'application/pdf',
        originalname: 'resume.pdf',
      }),
    (error) => error.code === 'INVALID_PDF_SIGNATURE',
  );
});

test('PDF extractor returns text and page count from a valid PDF', async () => {
  const extracted = await extractPdfText(createPdf('Hello Resume'));

  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.text, /Hello Resume/);
});

test('text ingestion normalizes and classifies without AI calls', () => {
  const service = createInputService();
  const ingestion = service.ingestText({
    input: 'I want to build a project management API.',
    declaredType: 'auto',
  });

  assert.equal(ingestion.inputType, 'project_description');
  assert.equal(ingestion.classification.type, 'project');
  assert.equal(ingestion.metadata.characterCount, ingestion.normalizedText.length);
});

test('resume ingestion uploads temporarily, extracts, classifies, and removes the file', async () => {
  const actions = [];
  const service = createInputService({
    flags: { isEnabled: async () => true },
    temporaryFileStoreFactory: () => ({
      async upload() {
        actions.push('upload');
        return { publicId: 'temporary-resume' };
      },
      async remove(publicId) {
        actions.push(`remove:${publicId}`);
      },
    }),
    pdfExtractor: async () => ({ text: 'React developer with SQL experience.', pageCount: 1 }),
  });

  const ingestion = await service.ingestResume({
    ownerId: 'owner-id',
    file: {
      buffer: createPdf(),
      mimetype: 'application/pdf',
      originalname: 'resume.pdf',
    },
  });

  assert.equal(ingestion.classification.type, 'resume');
  assert.equal(ingestion.normalizedText, 'React developer with SQL experience.');
  assert.deepEqual(actions, ['upload', 'remove:temporary-resume']);
});

test('document ingestion preserves PDF identity instead of treating it as a resume', async () => {
  const service = createInputService({
    flags: { isEnabled: async () => true },
    temporaryFileStoreFactory: () => ({
      async upload() {
        return { publicId: 'temporary-document' };
      },
      async remove() {},
    }),
    pdfExtractor: async () => ({
      text: 'PROJECT REQUIREMENTS\nBuild a React dashboard.',
      pageCount: 2,
    }),
  });

  const ingestion = await service.ingestDocument({
    ownerId: 'owner-id',
    file: {
      buffer: createPdf(),
      mimetype: 'application/pdf',
      originalname: 'project-brief.pdf',
    },
  });

  assert.equal(ingestion.inputType, 'pdf');
  assert.equal(ingestion.classification.type, 'pdf');
  assert.equal(ingestion.metadata.fileName, 'project-brief.pdf');
  assert.equal(ingestion.metadata.pageCount, 2);
});

test('document ingestion automatically recognizes resume-shaped PDF content', async () => {
  const service = createInputService({
    flags: { isEnabled: async () => true },
    temporaryFileStoreFactory: () => ({
      async upload() {
        return { publicId: 'temporary-auto-resume' };
      },
      async remove() {},
    }),
    pdfExtractor: async () => ({
      text: 'EXPERIENCE\nFrontend internship\nSKILLS\nReact\nEDUCATION\nB.Tech',
      pageCount: 1,
    }),
  });

  const ingestion = await service.ingestDocument({
    ownerId: 'owner-id',
    file: {
      buffer: createPdf(),
      mimetype: 'application/pdf',
      originalname: 'profile.pdf',
    },
  });

  assert.equal(ingestion.inputType, 'resume');
  assert.equal(ingestion.classification.type, 'resume');
  assert.ok(ingestion.classification.signals.includes('resume_experience_section'));
});

test('resume ingestion is unavailable when its feature flag is disabled', async () => {
  let storageRequested = false;
  const service = createInputService({
    flags: { isEnabled: async () => false },
    temporaryFileStoreFactory: () => {
      storageRequested = true;
      return {};
    },
  });

  await assert.rejects(
    () =>
      service.ingestResume({
        ownerId: 'owner-id',
        file: {
          buffer: createPdf(),
          mimetype: 'application/pdf',
          originalname: 'resume.pdf',
        },
      }),
    (error) => error.code === 'RESUME_UPLOAD_DISABLED' && error.status === 404,
  );
  assert.equal(storageRequested, false);
});

test('resume ingestion cleans temporary storage when extraction fails', async () => {
  const actions = [];
  const service = createInputService({
    flags: { isEnabled: async () => true },
    temporaryFileStoreFactory: () => ({
      async upload() {
        actions.push('upload');
        return { publicId: 'temporary-resume' };
      },
      async remove() {
        actions.push('remove');
      },
    }),
    pdfExtractor: async () => {
      throw new Error('parse failed');
    },
  });

  await assert.rejects(() =>
    service.ingestResume({
      ownerId: 'owner-id',
      file: {
        buffer: createPdf(),
        mimetype: 'application/pdf',
        originalname: 'resume.pdf',
      },
    }),
  );
  assert.deepEqual(actions, ['upload', 'remove']);
});

test('Cloudinary adapter uploads authenticated raw data and destroys it', async () => {
  const calls = [];
  const store = createCloudinaryTemporaryFileStore({
    folder: 'temporary-test',
    client: {
      uploader: {
        upload_stream(options, callback) {
          calls.push({ action: 'upload', options });
          return new Writable({
            write(_chunk, _encoding, done) {
              done();
            },
            final(done) {
              callback(null, { public_id: 'temporary-id', bytes: 12, format: 'pdf' });
              done();
            },
          });
        },
        async destroy(publicId, options) {
          calls.push({ action: 'destroy', publicId, options });
          return { result: 'ok' };
        },
      },
    },
  });

  const uploaded = await store.upload({ buffer: Buffer.from('pdf'), ownerId: 'owner-id' });
  await store.remove(uploaded.publicId);

  assert.equal(uploaded.publicId, 'temporary-id');
  assert.equal(calls[0].options.resource_type, 'raw');
  assert.equal(calls[0].options.type, 'authenticated');
  assert.equal(calls[1].action, 'destroy');
});
