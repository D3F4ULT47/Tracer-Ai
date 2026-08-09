import {
  ASSESSMENT_ENDPOINTS,
  CLARIFICATION_ENDPOINTS,
  INPUT_ENDPOINTS,
  LEARNING_CONTEXT_ENDPOINTS,
  ROADMAP_PLANNING_ENDPOINTS,
  SOURCE_UNDERSTANDING_ENDPOINTS,
} from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';
import { roadmapApi } from './roadmap-api.js';
import { buildGenerationSources } from './generation-sources.js';
import { getAnonymousRoadmapSessionId } from '../preview-storage.js';

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

const backendStageMessages = Object.freeze({
  roadmap_planning: 'Building the prerequisite graph and complete learning sequence.',
  roadmap_validation: 'Checking dependencies, workload, and learning progression.',
  resource_discovery: 'Finding authoritative material for each roadmap task.',
  resource_ranking: 'Matching resources to your level, language, and preferences.',
  resource_attachment: 'Connecting the strongest resources to the right tasks.',
  persistence: 'Saving the roadmap and its first version.',
  workspace_ready: 'Preparing your interactive roadmap workspace.',
});

function emitStage(onStage, id, message, percentage) {
  onStage?.(message, { id, percentage });
}

async function generateRoadmapRequest(endpoint, body, onStage) {
  const generationSessionId = crypto.randomUUID();
  let stopped = false;
  let polling = false;

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      const response = await contractRequest(ROADMAP_PLANNING_ENDPOINTS.progress, {
        params: { sessionId: generationSessionId },
      });
      const progress = response.data;
      emitStage(onStage, progress.stage, backendStageMessages[progress.stage], progress.percentage);
    } catch {
      // Progress supports the UI; the generation request remains authoritative.
    } finally {
      polling = false;
    }
  }

  const interval = setInterval(() => void poll(), 400);
  try {
    return await contractRequest(endpoint, {
      body: { ...body, generationSessionId },
    });
  } finally {
    stopped = true;
    clearInterval(interval);
  }
}

async function generateFromContext(context, sourceUnderstanding, mode, onStage, persist) {
  if (mode !== 'quick') {
    emitStage(
      onStage,
      'learning_context',
      'Checking whether one detail would materially improve your roadmap.',
      40,
    );
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

  emitStage(onStage, 'roadmap_planning', backendStageMessages.roadmap_planning, 48);
  const endpoint = persist
    ? ROADMAP_PLANNING_ENDPOINTS.generate
    : ROADMAP_PLANNING_ENDPOINTS.preview;
  const anonymousSessionId = persist ? null : getAnonymousRoadmapSessionId();
  const generation = await generateRoadmapRequest(
    endpoint,
    {
      context,
      sourceUnderstanding,
      ...(anonymousSessionId ? { anonymousSessionId } : {}),
    },
    onStage,
  );
  emitStage(onStage, 'workspace_ready', backendStageMessages.workspace_ready, 100);
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
    emitStage(
      onStage,
      'input_analysis',
      'Analyzing your goal and detecting the kind of roadmap you need.',
      8,
    );
    const input = await contractRequest(INPUT_ENDPOINTS.ingestText, {
      body: {
        input: goal,
        declaredType: 'auto',
      },
    });
    const ingestion = input.data.ingestion;
    let fileIngestion = null;
    if (resumeFile) {
      emitStage(
        onStage,
        'source_understanding',
        'Reading your PDF and extracting useful evidence.',
        16,
      );
      const form = new FormData();
      form.append('document', resumeFile);
      const upload = await contractRequest(INPUT_ENDPOINTS.ingestDocument, { body: form });
      fileIngestion = upload.data.ingestion;
    }

    emitStage(
      onStage,
      'source_understanding',
      'Understanding your goal and every attached knowledge source.',
      18,
    );
    const sources = buildGenerationSources({
      text: ingestion.normalizedText,
      fileIngestions: [fileIngestion],
    });
    const sourceUnderstanding = await contractRequest(SOURCE_UNDERSTANDING_ENDPOINTS.create, {
      body: { sources },
    });

    emitStage(
      onStage,
      'learner_assessment',
      'Estimating your current level from the evidence you provided.',
      28,
    );
    const assessment = await contractRequest(ASSESSMENT_ENDPOINTS.create, {
      body: { inputs: assessmentInputs(ingestion, fileIngestion, sources) },
    });

    emitStage(
      onStage,
      'learning_context',
      'Combining your goal, experience, preferences, and constraints.',
      38,
    );
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
    emitStage(onStage, 'learning_context', 'Updating your learning context with your answer.', 40);
    const response = await contractRequest(CLARIFICATION_ENDPOINTS.respond, {
      body: { context, decision, answer },
    });
    emitStage(onStage, 'roadmap_planning', backendStageMessages.roadmap_planning, 48);
    const endpoint = persist
      ? ROADMAP_PLANNING_ENDPOINTS.generate
      : ROADMAP_PLANNING_ENDPOINTS.preview;
    const anonymousSessionId = persist ? null : getAnonymousRoadmapSessionId();
    const generation = await generateRoadmapRequest(
      endpoint,
      {
        context: response.data.context,
        sourceUnderstanding,
        ...(anonymousSessionId ? { anonymousSessionId } : {}),
      },
      onStage,
    );
    emitStage(onStage, 'workspace_ready', backendStageMessages.workspace_ready, 100);
    return {
      status: 'generated',
      persisted: persist,
      context: response.data.context,
      sourceUnderstanding,
      ...generation.data,
    };
  },

  async adoptPreview({ roadmapId, anonymousSessionId, onStage }) {
    if (!roadmapId || !anonymousSessionId) {
      throw new Error('This roadmap preview cannot be adopted. Please generate a fresh roadmap.');
    }
    emitStage(onStage, 'persistence', 'Attaching your existing roadmap to your account.', 94);
    const adoption = await roadmapApi.adoptAnonymous({ roadmapId, anonymousSessionId });
    emitStage(onStage, 'workspace_ready', backendStageMessages.workspace_ready, 100);
    return {
      roadmapId: adoption.data.workspace.roadmapId,
      version: adoption.data.workspace.currentVersion,
      workspace: adoption.data.workspace,
    };
  },
});
