import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const eligibilityFile = fileURLToPath(
  new URL('../../../../../evaluation/routing/model-eligibility.json', import.meta.url),
);

const approvedStatuses = new Set(['approved', 'legacy_baseline']);

export function loadModelEligibility(path = eligibilityFile) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).entries ?? [];
  } catch {
    return [];
  }
}

/**
 * Returns `approved`, `legacy_baseline` or `unapproved` for one chain entry and operation.
 */
export function eligibilityOf(entry, { operation, adapter, records }) {
  const record = records.find(
    (candidate) =>
      candidate.provider === entry.provider &&
      candidate.model === entry.model &&
      candidate.adapter === adapter &&
      candidate.operations?.includes(operation),
  );
  return record && approvedStatuses.has(record.status) ? record.status : 'unapproved';
}
