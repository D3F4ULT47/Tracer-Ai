import clarification from './clarification.schema.json' with { type: 'json' };
import dependencyGraph from './dependency-graph.schema.json' with { type: 'json' };
import intent from './intent.schema.json' with { type: 'json' };
import knowledge from './knowledge.schema.json' with { type: 'json' };
import learningContext from './learning-context.schema.json' with { type: 'json' };
import learnerAssessment from './learner-assessment.schema.json' with { type: 'json' };
import planner from './planner.schema.json' with { type: 'json' };
import profile from './profile.schema.json' with { type: 'json' };
import resume from './resume.schema.json' with { type: 'json' };
import roadmap from './roadmap.schema.json' with { type: 'json' };
import roadmapGeneration from './roadmap-generation.schema.json' with { type: 'json' };
import roadmapSource from './roadmap-source.schema.json' with { type: 'json' };
import sourceUnderstanding from './source-understanding.schema.json' with { type: 'json' };

export const AI_SCHEMA_VERSION = '1.0.0';

export const aiSchemas = Object.freeze({
  clarification,
  dependencyGraph,
  intent,
  knowledge,
  learningContext,
  learnerAssessment,
  planner,
  profile,
  resume,
  roadmap,
  roadmapGeneration,
  roadmapSource,
  sourceUnderstanding,
});

export function getAiSchema(name) {
  const schema = aiSchemas[name];
  if (!schema) throw new Error(`Unknown AI schema: ${name}`);
  return schema;
}
