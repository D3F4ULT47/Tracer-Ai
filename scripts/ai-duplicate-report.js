/**
 * Read-only report on repeated AI calls (Plan 0003 C-01 and C-12).
 *
 *   node scripts/ai-duplicate-report.js [--days=30] [--window-minutes=10] [--json]
 *
 * Part 1 counts runs that repeat an earlier run of the same operation, learner and input hash
 * within the window: the calls idempotency and deduplication are meant to remove.
 * Part 2 counts calls that were actually served from the cache or a shared in-flight call, and
 * the cost of the original call each one avoided. Costs are grouped by currency, never converted.
 */
import mongoose from 'mongoose';
import { env } from '../server/src/config/env.js';

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? Number(match.split('=')[1]) : fallback;
};
const days = argument('days', 30);
const windowMs = argument('window-minutes', 10) * 60_000;
const asJson = process.argv.includes('--json');
const since = new Date(Date.now() - days * 86_400_000);

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.db;
const runs = db.collection('ai_runs');
const usage = db.collection('ai_usage_records');

async function costByRun(runIds) {
  const totals = new Map();
  if (!runIds.length) return totals;
  const cursor = usage.aggregate([
    { $match: { runId: { $in: runIds }, calculatedCost: { $ne: null } } },
    {
      $group: {
        _id: { runId: '$runId', currency: '$costCurrency' },
        cost: { $sum: '$calculatedCost' },
      },
    },
  ]);
  for await (const row of cursor) {
    const entry = totals.get(row._id.runId) ?? {};
    entry[row._id.currency ?? 'unknown'] = (entry[row._id.currency ?? 'unknown'] ?? 0) + row.cost;
    totals.set(row._id.runId, entry);
  }
  return totals;
}

function addCosts(target, costs) {
  for (const [currency, value] of Object.entries(costs ?? {})) {
    target[currency] = (target[currency] ?? 0) + value;
  }
}

const repeats = new Map();
const repeatedRunIds = [];
let previous = null;
const cursor = runs
  .find(
    { createdAt: { $gte: since } },
    { projection: { runId: 1, operation: 1, ownerId: 1, inputHash: 1, createdAt: 1 } },
  )
  .sort({ operation: 1, inputHash: 1, ownerId: 1, createdAt: 1 });
for await (const run of cursor) {
  const operation = repeats.get(run.operation) ?? { runs: 0, repeats: 0, cost: {} };
  operation.runs += 1;
  const sameCall =
    previous &&
    previous.operation === run.operation &&
    previous.inputHash === run.inputHash &&
    String(previous.ownerId) === String(run.ownerId) &&
    run.createdAt - previous.createdAt <= windowMs;
  if (sameCall) {
    operation.repeats += 1;
    repeatedRunIds.push(run.runId);
  }
  repeats.set(run.operation, operation);
  previous = run;
}

const repeatCosts = await costByRun(repeatedRunIds);
const repeatRunOperation = new Map();
for await (const run of runs.find(
  { runId: { $in: repeatedRunIds } },
  { projection: { runId: 1, operation: 1 } },
)) {
  repeatRunOperation.set(run.runId, run.operation);
}
for (const [runId, costs] of repeatCosts) {
  addCosts(repeats.get(repeatRunOperation.get(runId)).cost, costs);
}

const reuse = new Map();
const reusedRecords = await usage
  .find(
    { createdAt: { $gte: since }, reuseOutcome: { $ne: null } },
    { projection: { operation: 1, reuseOutcome: 1, sourceRunId: 1 } },
  )
  .toArray();
const sourceCosts = await costByRun([
  ...new Set(reusedRecords.map((record) => record.sourceRunId).filter(Boolean)),
]);
for (const record of reusedRecords) {
  const key = `${record.operation}|${record.reuseOutcome}`;
  const entry = reuse.get(key) ?? {
    operation: record.operation,
    outcome: record.reuseOutcome,
    calls: 0,
    avoidedCost: {},
  };
  entry.calls += 1;
  addCosts(entry.avoidedCost, sourceCosts.get(record.sourceRunId));
  reuse.set(key, entry);
}

await mongoose.disconnect();

const report = {
  windowDays: days,
  repeatWindowMinutes: windowMs / 60_000,
  repeatedCalls: [...repeats].map(([operation, value]) => ({
    operation,
    runs: value.runs,
    repeats: value.repeats,
    repeatShare: value.runs ? Number((value.repeats / value.runs).toFixed(4)) : 0,
    repeatCost: value.cost,
  })),
  reusedCalls: [...reuse.values()],
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const money = (costs) =>
    Object.entries(costs)
      .map(([currency, value]) => `${value.toFixed(4)} ${currency}`)
      .join(', ') || 'no cost recorded';
  console.log(`AI repeat report, last ${days} days, repeat window ${windowMs / 60_000} min\n`);
  console.log('Repeated calls (same operation, learner and input):');
  if (!report.repeatedCalls.length) console.log('  no runs in this period');
  for (const row of report.repeatedCalls) {
    console.log(
      `  ${row.operation}: ${row.repeats} of ${row.runs} runs repeated (${(row.repeatShare * 100).toFixed(1)}%), cost of repeats ${money(row.repeatCost)}`,
    );
  }
  console.log('\nCalls served without a provider call:');
  if (!report.reusedCalls.length) console.log('  none recorded yet');
  for (const row of report.reusedCalls) {
    console.log(
      `  ${row.operation} ${row.outcome}: ${row.calls} calls, original cost avoided ${money(row.avoidedCost)}`,
    );
  }
}
