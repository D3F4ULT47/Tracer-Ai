const sourcePriority = Object.freeze({
  explicit_user: 700,
  user_profile: 650,
  questionnaire: 600,
  learning_profile: 500,
  resume_analysis: 400,
  ai_assessment: 300,
  ai_inference: 250,
  system_derived: 150,
  system_default: 100,
});

function canonicalize(value) {
  if (typeof value === 'string') return value.normalize('NFKC').trim().toLocaleLowerCase('en');
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function comparable(value) {
  return JSON.stringify(canonicalize(value));
}

function comparableForField(fieldName, value) {
  if (
    ['knownSkills', 'missingSkills', 'technologyStack'].includes(fieldName) &&
    Array.isArray(value)
  ) {
    return comparable(value.map((skill) => skill.name));
  }
  return comparable(value);
}

function meaningful(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function unresolved(fieldName) {
  return Object.freeze({
    value: null,
    status: 'unresolved',
    confidence: 0,
    evidence: Object.freeze([]),
    provenance: Object.freeze([
      Object.freeze({
        source: 'system_derived',
        value: null,
        confidence: 0,
        evidence: Object.freeze([]),
        reasoning: `No source supplied a usable value for ${fieldName}.`,
        selected: true,
      }),
    ]),
    conflicts: Object.freeze([]),
  });
}

export function createCandidate({ source, value, confidence, evidence = [], reasoning }) {
  if (!(source in sourcePriority)) throw new Error(`Unknown Learning Context source: ${source}`);
  return Object.freeze({
    source,
    value,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence: Object.freeze(evidence),
    reasoning,
  });
}

export function resolveContextField(fieldName, candidates = []) {
  const usable = candidates
    .filter((candidate) => meaningful(candidate.value))
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        sourcePriority[right.candidate.source] - sourcePriority[left.candidate.source] ||
        left.index - right.index,
    )
    .map(({ candidate }) => candidate);

  if (usable.length === 0) return unresolved(fieldName);

  const selected = usable[0];
  const selectedComparable = comparableForField(fieldName, selected.value);
  const conflicting = usable
    .slice(1)
    .filter((candidate) => comparableForField(fieldName, candidate.value) !== selectedComparable);
  const conflicts = conflicting.map((candidate) =>
    Object.freeze({
      selectedSource: selected.source,
      selectedValue: selected.value,
      conflictingSource: candidate.source,
      conflictingValue: candidate.value,
      reason: `${selected.source} has higher precedence than ${candidate.source}; both values are preserved.`,
    }),
  );

  return Object.freeze({
    value: selected.value,
    status: conflicts.length > 0 ? 'conflicted' : 'resolved',
    confidence: selected.confidence,
    evidence: selected.evidence,
    provenance: Object.freeze(
      usable.map((candidate) =>
        Object.freeze({
          ...candidate,
          selected: candidate === selected,
        }),
      ),
    ),
    conflicts: Object.freeze(conflicts),
  });
}

export function getSourcePriority(source) {
  return sourcePriority[source];
}
