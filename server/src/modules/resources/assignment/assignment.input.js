import { z } from 'zod';
import { AppError } from '../../../shared/app-error.js';

const taskSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(5_000),
    estimatedMinutes: z.number().int().min(5).max(100_000),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    completionCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    type: z.enum(['learn', 'practice', 'project', 'assessment', 'checkpoint']),
  })
  .passthrough();

const roadmapSchema = z
  .object({
    phases: z
      .array(
        z
          .object({
            weeks: z
              .array(
                z
                  .object({
                    tasks: z.array(taskSchema).min(1).max(50),
                  })
                  .passthrough(),
              )
              .min(1)
              .max(52),
          })
          .passthrough(),
      )
      .min(1)
      .max(30),
  })
  .passthrough();

const rankedCandidateSchema = z
  .object({
    rank: z.number().int().min(1),
    resource: z
      .object({
        resourceId: z.uuid(),
        provider: z.string().min(1).max(100),
        type: z.enum([
          'video',
          'playlist',
          'repository',
          'documentation',
          'course',
          'project',
          'reference',
          'article',
        ]),
        accessType: z.enum(['free', 'paid', 'mixed', 'unknown']),
      })
      .passthrough(),
    rankingVersion: z.string().min(1),
  })
  .passthrough();

const inputSchema = z.object({
  learningContext: z.record(z.string(), z.unknown()),
  roadmap: roadmapSchema,
  rankedCandidatesByTask: z
    .array(
      z.object({
        taskKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        candidates: z.array(rankedCandidateSchema).max(500),
      }),
    )
    .min(1)
    .max(1_500),
});

function validationError(issues) {
  return new AppError('Learning experience assignment input is invalid', {
    status: 422,
    code: 'RESOURCE_ASSIGNMENT_INPUT_INVALID',
    details: issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export function validateAssignmentInput(input) {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw validationError(result.error.issues);

  const taskKeys = result.data.roadmap.phases.flatMap((phase) =>
    phase.weeks.flatMap((week) => week.tasks.map((task) => task.key)),
  );
  const uniqueTaskKeys = new Set(taskKeys);
  const suppliedKeys = result.data.rankedCandidatesByTask.map(({ taskKey }) => taskKey);
  const uniqueSuppliedKeys = new Set(suppliedKeys);
  if (
    uniqueTaskKeys.size !== taskKeys.length ||
    uniqueSuppliedKeys.size !== suppliedKeys.length ||
    taskKeys.length !== suppliedKeys.length ||
    taskKeys.some((key) => !uniqueSuppliedKeys.has(key))
  ) {
    throw new AppError('Ranked candidates must map exactly once to every roadmap task', {
      status: 422,
      code: 'RESOURCE_ASSIGNMENT_TASK_MAPPING_INVALID',
    });
  }
  return result.data;
}
