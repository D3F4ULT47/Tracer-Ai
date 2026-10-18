import {
  isGroundedExcerpt,
  normalizeRequirementCriticality,
  validateSourceEvidence,
} from '../source-understanding/source-understanding.validator.js';

export const EVIDENCE_REPAIR_STAGE = 'evidence_repair';
export const EVIDENCE_REPAIR_PROMPT = Object.freeze({ name: 'evidence-repair', version: '1.0.0' });
const MIN_REPAIR_EXCERPT_CHARACTERS = 12;
const REPAIR_MAX_OUTPUT_TOKENS = 2_000;

export const evidenceRepairSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['quotes'],
  properties: {
    quotes: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirementId', 'sourceId', 'excerpt'],
        properties: {
          requirementId: { type: 'string', maxLength: 10 },
          sourceId: { type: 'string', maxLength: 100 },
          excerpt: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
});

/**
 * Gives each demoted requirement the first returned quote that is found in the named source and
 * restores it to a stated source fact. Requirements without such a quote stay demoted.
 */
export function applyEvidenceRepair(understanding, requirementIds, quotes, sources) {
  const contentById = new Map(sources.map((source) => [source.sourceId, source.content]));
  const pending = new Set(requirementIds);
  const usedIds = new Set(understanding.evidence.map(({ evidenceId }) => evidenceId));
  const evidence = [...understanding.evidence];
  const repaired = [];
  const nextEvidenceId = () => {
    let index = 1;
    while (usedIds.has(`RE${index}`)) index += 1;
    usedIds.add(`RE${index}`);
    return `RE${index}`;
  };

  const requirements = understanding.requirements.map((requirement) => {
    if (!pending.has(requirement.id) || requirement.evidenceIds.length > 0) return requirement;
    const quote = quotes.find(
      ({ requirementId, sourceId, excerpt }) =>
        requirementId === requirement.id &&
        contentById.has(sourceId) &&
        excerpt.trim().length >= MIN_REPAIR_EXCERPT_CHARACTERS &&
        isGroundedExcerpt(excerpt, contentById.get(sourceId)),
    );
    if (!quote) return requirement;
    const evidenceId = nextEvidenceId();
    evidence.push({
      evidenceId,
      sourceId: quote.sourceId,
      locator: 'evidence repair',
      excerpt: quote.excerpt.trim(),
    });
    repaired.push(requirement.id);
    return { ...requirement, origin: 'source_fact', evidenceIds: [evidenceId] };
  });
  return { understanding: { ...understanding, evidence, requirements }, repaired };
}

/**
 * One bounded call that asks for exact quotes for requirements whose evidence was not found. It
 * never fails the preparation: on any error, or when nothing usable comes back, the salvaged
 * understanding is returned unchanged.
 */
export async function repairRequirementEvidence({
  finalized,
  sources,
  reuseHints,
  provider,
  configuration,
  promptLoader,
  repositories,
  recordUsage,
  metadata,
  timeoutMs,
  log,
}) {
  const demoted = finalized.report?.demotedRequirements ?? [];
  if (demoted.length === 0) return finalized;

  const requirements = finalized.salvaged.requirements
    .filter(({ id }) => demoted.includes(id))
    .map(({ id, statement, kind }) => ({ id, statement, kind }));
  const startedAt = Date.now();
  let prompt = null;
  const record = (fields) =>
    recordUsage({
      prompt,
      stage: EVIDENCE_REPAIR_STAGE,
      latencyMs: Date.now() - startedAt,
      ...fields,
    });

  let result;
  try {
    prompt = await promptLoader(EVIDENCE_REPAIR_PROMPT.name, EVIDENCE_REPAIR_PROMPT.version);
    await repositories.prompts.ensure(prompt);
    result = await provider.generateStructured({
      model: configuration.model,
      instructions: prompt.content,
      input: JSON.stringify({ requirements, sources }),
      reuse: { input: { requirements, sources: reuseHints.stableSources }, ids: reuseHints.ids },
      schema: evidenceRepairSchema,
      schemaName: 'evidence_repair',
      schemaDescription: 'Exact source quotes for requirements whose evidence was not found.',
      maxOutputTokens: REPAIR_MAX_OUTPUT_TOKENS,
      metadata: { ...metadata, stage: EVIDENCE_REPAIR_STAGE },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    log.warn({ errorCode: error?.code, demoted: demoted.length }, 'Evidence repair failed');
    if (prompt) {
      await Promise.resolve()
        .then(() => record({ error, outcome: 'provider_error' }))
        .catch((accountingError) =>
          log.error({ err: accountingError }, 'Evidence repair accounting failed'),
        );
    }
    return finalized;
  }

  await Promise.resolve()
    .then(() => record({ result, outcome: 'success' }))
    .catch((error) => log.error({ err: error }, 'Evidence repair accounting failed'));
  const applied = applyEvidenceRepair(
    finalized.salvaged,
    demoted,
    result.data?.quotes ?? [],
    sources,
  );
  if (applied.repaired.length === 0) return finalized;
  let salvaged;
  try {
    salvaged = validateSourceEvidence(applied.understanding, sources);
  } catch {
    return finalized;
  }
  return {
    understanding: normalizeRequirementCriticality(salvaged),
    salvaged,
    report: Object.freeze({
      ...finalized.report,
      demotedRequirements: Object.freeze(demoted.filter((id) => !applied.repaired.includes(id))),
      repairedRequirements: Object.freeze(applied.repaired),
    }),
  };
}
