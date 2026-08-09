import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';

const inputSchema = z.object({
  roadmap: z
    .object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().max(5_000).default(''),
      summary: z.string().trim().max(5_000).default(''),
      type: z.enum(['career', 'skill', 'project', 'resume']),
    })
    .optional(),
  phase: z
    .object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().max(5_000).default(''),
      objective: z.string().trim().max(1_000).default(''),
    })
    .optional(),
  week: z
    .object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().max(5_000).default(''),
      objective: z.string().trim().max(1_000).default(''),
    })
    .optional(),
  task: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5_000).default(''),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  }),
  learningContext: z.record(z.string(), z.unknown()).default({}),
});

export function validateDiscoveryInput(input) {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError('Resource discovery input is invalid', {
      status: 422,
      code: 'RESOURCE_DISCOVERY_INPUT_INVALID',
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function fieldValue(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

const ignoredTerms = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'before',
  'build',
  'challenge',
  'complete',
  'create',
  'for',
  'from',
  'have',
  'into',
  'learn',
  'needed',
  'roadmap',
  'should',
  'that',
  'the',
  'their',
  'this',
  'through',
  'understand',
  'using',
  'with',
  'without',
  'your',
]);

function words(...values) {
  return (
    values
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .match(/[a-z0-9+#.%-]{2,}/g) ?? []
  );
}

function semanticTerms(values, maximum = 24) {
  const frequencies = new Map();
  const firstSeen = new Map();
  let position = 0;
  for (const term of words(...values)) {
    if (ignoredTerms.has(term)) continue;
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    if (!firstSeen.has(term)) firstSeen.set(term, position);
    position += 1;
  }
  return [...frequencies]
    .sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount ||
        firstSeen.get(left) - firstSeen.get(right) ||
        left.localeCompare(right),
    )
    .slice(0, maximum)
    .map(([term]) => term);
}

function skillNames(field) {
  const value = fieldValue(field);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry : (entry?.name ?? entry?.value)))
    .filter(Boolean);
}

export function buildDiscoveryQuery({ roadmap, phase, week, task, learningContext }) {
  const technologies = fieldValue(learningContext.technologyStack);
  const preferredLanguage = fieldValue(learningContext.preferredResourceLanguage);
  const technologyTerms = Array.isArray(technologies)
    ? technologies
        .map((technology) =>
          typeof technology === 'string' ? technology : (technology?.name ?? technology?.value),
        )
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const learnerTerms = [
    ...skillNames(learningContext.missingSkills),
    ...skillNames(learningContext.knownSkills),
  ].slice(0, 6);
  const contextualTerms = semanticTerms([
    task.description,
    week?.objective,
    week?.description,
    phase?.objective,
    phase?.description,
    roadmap?.description,
    roadmap?.summary,
    fieldValue(learningContext.primaryGoal),
    fieldValue(learningContext.projectGoal),
    fieldValue(learningContext.careerGoal),
    ...technologyTerms,
    ...learnerTerms,
  ]);
  const query = [...new Set([task.title, ...contextualTerms, ...technologyTerms])]
    .join(' ')
    .slice(0, 500);
  return Object.freeze({
    query,
    semanticTerms: Object.freeze(contextualTerms),
    roadmap: roadmap ? Object.freeze({ ...roadmap }) : null,
    phase: phase ? Object.freeze({ ...phase }) : null,
    week: week ? Object.freeze({ ...week }) : null,
    task: Object.freeze({ ...task }),
    preferredLanguage: typeof preferredLanguage === 'string' ? preferredLanguage : null,
  });
}
