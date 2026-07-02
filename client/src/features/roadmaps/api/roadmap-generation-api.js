import {
  ASSESSMENT_ENDPOINTS,
  CLARIFICATION_ENDPOINTS,
  INPUT_ENDPOINTS,
  LEARNING_CONTEXT_ENDPOINTS,
  ROADMAP_PLANNING_ENDPOINTS,
  SOURCE_UNDERSTANDING_ENDPOINTS,
} from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';
import { buildGenerationSources } from './generation-sources.js';

function primaryGoal(ingestion, sources) {
  return (
    sources.find((source) => source.type === 'natural_prompt')?.content ?? ingestion.normalizedText
  );
}

function assessmentInputs(ingestion, fileIngestion, sources) {
  const inputs = {};
  if (ingestion.inputType === 'project_description') {
    inputs.projectDescription = primaryGoal(ingestion, sources);
  } else {
    inputs.naturalLanguage = primaryGoal(ingestion, sources);
  }
  if (fileIngestion?.inputType === 'resume') inputs.resumeText = fileIngestion.normalizedText;
  return inputs;
}

function learningGoalType(classification) {
  return classification === 'resume' ? 'career_goal' : classification;
}

async function generateFromContext(context, sourceUnderstanding, mode, onStage, persist) {
  if (mode !== 'quick') {
    onStage?.('Checking whether one clarification would improve your roadmap…');
    const clarification = await contractRequest(CLARIFICATION_ENDPOINTS.decide, {
      body: { context },
    });
    if (clarification.data.decision.clarificationRequired) {
      return {
        status: 'clarification',
        context,
        sourceUnderstanding,
        decision: clarification.data.decision,
      };
    }
  }

  onStage?.('Planning your complete roadmap…');
  const endpoint = persist
    ? ROADMAP_PLANNING_ENDPOINTS.generate
    : ROADMAP_PLANNING_ENDPOINTS.preview;
  const generation = await contractRequest(endpoint, {
    body: { context, sourceUnderstanding },
  });
  onStage?.('Finalizing your learning journey…');
  return {
    status: 'generated',
    context,
    sourceUnderstanding,
    persisted: persist,
    ...generation.data,
  };
}

export const roadmapGenerationApi = Object.freeze({
  async generate({
    goal,
    experienceLevel,
    mode = 'quick',
    questionnaire = {},
    resumeFile,
    persist = false,
    onStage,
  }) {
    onStage?.('Understanding your goal…');
    const input = await contractRequest(INPUT_ENDPOINTS.ingestText, {
      body: {
        input: goal,
        declaredType: 'auto',
      },
    });
    const ingestion = input.data.ingestion;
    let fileIngestion = null;
    if (resumeFile) {
      onStage?.('Reading your PDF…');
      const form = new FormData();
      form.append('document', resumeFile);
      const upload = await contractRequest(INPUT_ENDPOINTS.ingestDocument, { body: form });
      fileIngestion = upload.data.ingestion;
    }

    onStage?.('Understanding your knowledge sources…');
    const sources = buildGenerationSources({
      text: ingestion.normalizedText,
      fileIngestions: [fileIngestion],
    });
    const sourceUnderstanding = await contractRequest(SOURCE_UNDERSTANDING_ENDPOINTS.create, {
      body: { sources },
    });

    onStage?.('Assessing your current level…');
    const assessment = await contractRequest(ASSESSMENT_ENDPOINTS.create, {
      body: { inputs: assessmentInputs(ingestion, fileIngestion, sources) },
    });

    onStage?.('Building your learning context…');
    const contextResult = await contractRequest(LEARNING_CONTEXT_ENDPOINTS.create, {
      body: {
        assessment: assessment.data.assessment,
        mode,
        explicitInput: {
          primaryGoal: primaryGoal(ingestion, sources),
          goalType: learningGoalType(ingestion.classification.type),
          ...(experienceLevel ? { experienceLevel } : {}),
        },
        questionnaire,
        sourceVersions: { assessmentVersion: assessment.data.assessment.schemaVersion },
      },
    });
    return generateFromContext(
      contextResult.data.context,
      sourceUnderstanding.data.understanding,
      mode,
      onStage,
      persist,
    );
  },

  async answerClarification({
    context,
    sourceUnderstanding,
    decision,
    answer,
    persist = false,
    onStage,
  }) {
    onStage?.('Updating your learning context…');
    const response = await contractRequest(CLARIFICATION_ENDPOINTS.respond, {
      body: { context, decision, answer },
    });
    onStage?.('Planning your complete roadmap…');
    const endpoint = persist
      ? ROADMAP_PLANNING_ENDPOINTS.generate
      : ROADMAP_PLANNING_ENDPOINTS.preview;
    const generation = await contractRequest(endpoint, {
      body: { context: response.data.context, sourceUnderstanding },
    });
    onStage?.('Finalizing your learning journey…');
    return {
      status: 'generated',
      persisted: persist,
      context: response.data.context,
      sourceUnderstanding,
      ...generation.data,
    };
  },

  async persistContext({ context, sourceUnderstanding, onStage }) {
    onStage?.('Saving your roadmap workspace…');
    const generation = await contractRequest(ROADMAP_PLANNING_ENDPOINTS.generate, {
      body: { context, sourceUnderstanding: sourceUnderstanding ?? null },
    });
    onStage?.('Opening your workspace…');
    return generation.data;
  },
});
