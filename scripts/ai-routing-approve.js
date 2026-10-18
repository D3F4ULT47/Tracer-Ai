#!/usr/bin/env node
/**
 * Writes production eligibility records from a completed evaluation (Plan 0002 sections 6 and 8,
 * acceptance test AT-HR-1).
 *
 *   node scripts/ai-routing-approve.js --evaluation=<id> [--write]
 *
 * For every model and operation in the runs file it checks the RFC 0001 section 5.1 thresholds and
 * the owner's R1 review in `evaluation/routing/reviews/<id>.json`. A record becomes `approved`
 * only when every threshold passes, every fixture in scope has a complete set of runs and the
 * review rates each of them without an `unacceptable`. Without `--write` it only prints the result.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : 'true'];
  }),
);
if (!args.evaluation) {
  console.error('Usage: node scripts/ai-routing-approve.js --evaluation=<id> [--write]');
  process.exit(2);
}

const thresholds = { schema: 0.95, evidence: 0.9, recall: 0.9, availabilityFailures: 0.2 };
const runsPerFixture = Number(args.runs ?? 3);
const evaluation = JSON.parse(
  readFileSync(`${root}evaluation/routing/runs/${args.evaluation}.json`, 'utf8'),
);
const review = JSON.parse(
  readFileSync(`${root}evaluation/routing/reviews/${args.evaluation}.json`, 'utf8'),
);
const eligibilityFile = `${root}evaluation/routing/model-eligibility.json`;
const eligibility = JSON.parse(readFileSync(eligibilityFile, 'utf8'));
const validRatings = new Set(['acceptable', 'acceptable_with_notes', 'unacceptable']);

const decisions = evaluation.summary.map((row) => {
  const reasons = [];
  const settings = evaluation.settings[row.model];
  const isFree = settings.endpointClass === 'free';
  if (row.schemaPassRate === null || row.schemaPassRate < thresholds.schema) {
    reasons.push(`schema pass rate ${row.schemaPassRate} < ${thresholds.schema}`);
  }
  if (row.evidencePassRate === null || row.evidencePassRate < thresholds.evidence) {
    reasons.push(`evidence pass rate ${row.evidencePassRate} < ${thresholds.evidence}`);
  }
  if (row.criticalRecall !== null && row.criticalRecall < thresholds.recall) {
    reasons.push(`critical recall ${row.criticalRecall} < ${thresholds.recall}`);
  }
  if (isFree && row.availabilityFailureRate >= thresholds.availabilityFailures) {
    reasons.push(
      `availability failure rate ${row.availabilityFailureRate} >= ${thresholds.availabilityFailures}`,
    );
  }
  for (const fixture of row.fixtures) {
    const runs = evaluation.runs.filter(
      (run) => run.model === row.model && run.fixture === fixture && run.outcome !== 'skipped',
    );
    if (runs.length < runsPerFixture)
      reasons.push(`${fixture}: ${runs.length}/${runsPerFixture} runs`);
    const item = review.items.find(
      (entry) => entry.fixture === fixture && entry.model === row.model,
    );
    if (!item || !validRatings.has(item.rating)) reasons.push(`${fixture}: not reviewed`);
    else if (item.rating === 'unacceptable') reasons.push(`${fixture}: rated unacceptable`);
  }
  if (!review.reviewer || !review.reviewedAt) reasons.push('review has no reviewer and date');
  return { ...row, adapter: settings.adapter, approved: reasons.length === 0, reasons };
});

for (const decision of decisions) {
  console.log(
    `${decision.approved ? 'APPROVED' : 'not approved'}  ${decision.model}  ${decision.operation}` +
      (decision.reasons.length ? `\n    ${decision.reasons.join('\n    ')}` : ''),
  );
}

const approved = decisions.filter((decision) => decision.approved);
if (args.write && approved.length) {
  for (const decision of approved) {
    const [provider, ...model] = decision.model.split(':');
    const modelId = model.join(':');
    let record = eligibility.entries.find(
      (entry) =>
        entry.provider === provider &&
        entry.model === modelId &&
        entry.adapter === decision.adapter &&
        entry.status === 'approved',
    );
    if (!record) {
      record = {
        provider,
        model: modelId,
        adapter: decision.adapter,
        operations: [],
        status: 'approved',
      };
      eligibility.entries.push(record);
    }
    if (!record.operations.includes(decision.operation)) record.operations.push(decision.operation);
    record.evaluationId = args.evaluation;
    record.reviewer = review.reviewer;
    record.approvedAt = new Date().toISOString();
  }
  writeFileSync(eligibilityFile, `${JSON.stringify(eligibility, null, 2)}\n`);
  console.log(
    `\nWrote ${approved.length} approval(s) to evaluation/routing/model-eligibility.json`,
  );
} else if (args.write) {
  console.log('\nNothing approved; model-eligibility.json unchanged.');
}
