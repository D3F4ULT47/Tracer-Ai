import { AppError } from '../../../shared/app-error.js';
import { validateAiOutput } from '../json.validator.js';
import { createCandidate, resolveContextField } from '../learning-context/context-field.js';
import { LEARNING_CONTEXT_FIELD_NAMES } from '../learning-context/learning-context.builder.js';
import {
  clarificationQuestionRegistry,
  getClarificationQuestionDefinition,
} from './question-registry.js';

function contextConfidence(context) {
  return typeof context.confidence.value === 'number' ? context.confidence.value : 0;
}

function readyDecision(context, reason) {
  return Object.freeze({
    schemaVersion: '2.0.0',
    status: 'READY',
    confidence: contextConfidence(context),
    clarificationRequired: false,
    selectedQuestion: null,
    reason,
    affectedFields: Object.freeze([]),
    expectedConfidenceGain: 0,
  });
}

function questionDecision(context, definition) {
  const selectedQuestion = Object.freeze({
    id: definition.id,
    question: definition.question,
    type: definition.type,
    options: Object.freeze(definition.options(context)),
    reason: definition.reason,
    affectedFields: Object.freeze(definition.affectedFields),
    targetField: definition.targetField,
  });
  return Object.freeze({
    schemaVersion: '2.0.0',
    status: 'CLARIFICATION_REQUIRED',
    confidence: contextConfidence(context),
    clarificationRequired: true,
    selectedQuestion,
    reason: definition.reason,
    affectedFields: Object.freeze(definition.affectedFields),
    expectedConfidenceGain: definition.expectedConfidenceGain,
  });
}

function validateAnswerAgainstOptions(question, answer) {
  if (!['multiple_choice', 'dropdown', 'boolean'].includes(question.type)) return;
  if (!question.options.some((option) => option.value === answer)) {
    throw new AppError('Clarification answer is not one of the allowed options', {
      status: 400,
      code: 'INVALID_CLARIFICATION_RESPONSE',
    });
  }
}

function previousCandidates(field) {
  return field.provenance.map((provenance) =>
    createCandidate({
      source: provenance.source,
      value: provenance.value,
      confidence: provenance.confidence,
      evidence: provenance.evidence,
      reasoning: provenance.reasoning,
    }),
  );
}

function answerEvidence(answer) {
  return Object.freeze({
    source: 'explicit_user',
    excerpt: (typeof answer === 'string' ? answer : JSON.stringify(answer)).slice(0, 500),
  });
}

function derivedField(name, value, confidence, evidence, reasoning) {
  return resolveContextField(name, [
    createCandidate({
      source: 'system_derived',
      value,
      confidence,
      evidence,
      reasoning,
    }),
  ]);
}

function uniqueEvidence(items) {
  return [...new Map(items.map((item) => [`${item.source}:${item.excerpt}`, item])).values()].slice(
    0,
    100,
  );
}

function recalculateConfidence(context) {
  const resolved = LEARNING_CONTEXT_FIELD_NAMES.map((field) => context[field]).filter(
    (field) => field.status !== 'unresolved',
  );
  if (resolved.length === 0) return 0;
  return Number(
    (resolved.reduce((sum, field) => sum + field.confidence, 0) / resolved.length).toFixed(4),
  );
}

function decideContext(context) {
  validateAiOutput('learningContext', context);

  let decision;
  if (context.clarificationState.questionAsked) {
    decision = readyDecision(
      context,
      'The clarification limit has been reached; continue with the updated context.',
    );
  } else {
    const definition = clarificationQuestionRegistry
      .filter((question) => question.shouldAsk(context))
      .sort((left, right) => right.rank - left.rank)[0];
    decision = definition
      ? questionDecision(context, definition)
      : readyDecision(
          context,
          'The available context is sufficient; missing low-impact preferences do not block generation.',
        );
  }

  validateAiOutput('clarification', decision);
  return decision;
}

export function createClarificationService() {
  return Object.freeze({
    decide: decideContext,

    respond({ context, decision, answer }) {
      validateAiOutput('learningContext', context);
      validateAiOutput('clarification', decision);
      if (
        context.clarificationState.questionAsked ||
        !decision.clarificationRequired ||
        !decision.selectedQuestion
      ) {
        throw new AppError('No clarification response is currently accepted', {
          status: 409,
          code: 'CLARIFICATION_LIMIT_REACHED',
        });
      }

      const expectedDecision = decideContext(context);
      const expectedQuestion = expectedDecision.selectedQuestion;
      const definition = getClarificationQuestionDefinition(expectedQuestion?.id);
      if (
        !definition ||
        decision.selectedQuestion.id !== expectedQuestion.id ||
        decision.selectedQuestion.type !== expectedQuestion.type ||
        decision.selectedQuestion.targetField !== expectedQuestion.targetField
      ) {
        throw new AppError('Clarification decision is invalid', {
          status: 400,
          code: 'INVALID_CLARIFICATION_DECISION',
        });
      }
      validateAnswerAgainstOptions(expectedQuestion, answer);

      let normalizedAnswer;
      try {
        normalizedAnswer = definition.normalizeAnswer(answer, context);
      } catch (error) {
        throw new AppError(error.message, {
          status: 400,
          code: 'INVALID_CLARIFICATION_RESPONSE',
        });
      }

      const targetField = definition.targetField;
      const evidence = answerEvidence(answer);
      const updatedTarget = resolveContextField(targetField, [
        createCandidate({
          source: 'explicit_user',
          value: normalizedAnswer,
          confidence: 1,
          evidence: [evidence],
          reasoning: 'The learner supplied this value in response to the selected clarification.',
        }),
        ...previousCandidates(context[targetField]),
      ]);
      const remainingClarifications = (context.clarificationsRequired.value ?? []).filter(
        (item) => !definition.affectedFields.includes(item.field),
      );
      const remainingAssumptions = (context.assumptions.value ?? []).filter(
        (item) => !definition.affectedFields.includes(item.field),
      );
      const combinedEvidence = uniqueEvidence([...(context.evidence.value ?? []), evidence]);

      const updatedContext = {
        ...context,
        [targetField]: updatedTarget,
        contextVersion: context.contextVersion + 1,
        generatedAt: new Date().toISOString(),
        generatedFrom: {
          ...context.generatedFrom,
          clarificationVersion: context.generatedFrom.clarificationVersion + 1,
        },
        clarificationState: {
          questionAsked: true,
          questionId: definition.id,
          answeredAt: new Date().toISOString(),
        },
        evidence: derivedField(
          'evidence',
          combinedEvidence,
          Math.max(context.evidence.confidence, updatedTarget.confidence),
          combinedEvidence,
          'Evidence was updated with the learner clarification response.',
        ),
        assumptions: derivedField(
          'assumptions',
          remainingAssumptions,
          1,
          [],
          'Assumptions superseded by the learner response were removed.',
        ),
        clarificationsRequired: derivedField(
          'clarificationsRequired',
          remainingClarifications,
          1,
          [],
          'The answered clarification was removed from the unresolved clarification list.',
        ),
      };
      const confidence = recalculateConfidence(updatedContext);
      updatedContext.confidence = derivedField(
        'confidence',
        confidence,
        1,
        combinedEvidence,
        'Overall confidence was recalculated after the clarification response.',
      );

      validateAiOutput('learningContext', updatedContext);
      const updatedDecision = decideContext(updatedContext);
      return Object.freeze({
        context: Object.freeze(updatedContext),
        decision: updatedDecision,
      });
    },
  });
}

export const clarificationService = createClarificationService();
