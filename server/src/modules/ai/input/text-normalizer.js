import { createHash } from 'node:crypto';
import { AppError } from '../../../shared/app-error.js';

function stripControlCharacters(value) {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return character === '\n' || character === '\t' || (codePoint >= 32 && codePoint !== 127);
    })
    .join('');
}

export function normalizeInputText(value, { maximumCharacters = 200_000 } = {}) {
  const canonicalText = String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n');
  const normalized = stripControlCharacters(canonicalText)
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    throw new AppError('Input does not contain usable text', {
      status: 422,
      code: 'EMPTY_NORMALIZED_INPUT',
    });
  }

  if (normalized.length > maximumCharacters) {
    throw new AppError('Extracted input exceeds the configured text limit', {
      status: 413,
      code: 'EXTRACTED_TEXT_TOO_LARGE',
    });
  }

  return Object.freeze({
    text: normalized,
    characterCount: normalized.length,
    inputHash: createHash('sha256').update(normalized).digest('hex'),
  });
}
