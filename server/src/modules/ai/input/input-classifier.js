const projectPatterns = [
  {
    pattern: /\b(?:build|create|develop|ship|launch|implement)\b/i,
    signal: 'project_action',
  },
  {
    pattern: /\b(?:project|application|app|website|platform|api|saas|system)\b/i,
    signal: 'project_artifact',
  },
];
const careerPatterns = [
  {
    pattern: /\b(?:become|career|job|role|profession|interview)\b/i,
    signal: 'career_intent',
  },
  {
    pattern: /\b(?:engineer|developer|designer|manager|analyst|scientist|architect)\b/i,
    signal: 'career_role',
  },
];
const resumePatterns = [
  {
    pattern: /(^|\n)\s*(?:professional\s+)?(?:experience|employment|work history)\s*[:\n]/im,
    signal: 'resume_experience_section',
  },
  {
    pattern: /(^|\n)\s*(?:technical\s+)?skills\s*[:\n]/im,
    signal: 'resume_skills_section',
  },
  {
    pattern: /(^|\n)\s*education\s*[:\n]/im,
    signal: 'resume_education_section',
  },
  {
    pattern: /\b(?:linkedin\.com\/in\/|github\.com\/[^\s/]+|curriculum vitae|résumé|resume)\b/i,
    signal: 'resume_identity_signal',
  },
];

function matchingSignals(text, definitions) {
  return definitions.filter(({ pattern }) => pattern.test(text)).map(({ signal }) => signal);
}

export function classifyInput({ text, declaredType = 'auto', source = 'text' }) {
  if (source === 'resume') {
    return Object.freeze({
      type: 'resume',
      confidence: 1,
      signals: Object.freeze(['pdf_resume_upload']),
    });
  }

  if (source === 'pdf') {
    const resumeSignals = matchingSignals(text, resumePatterns);
    if (resumeSignals.length >= 2) {
      return Object.freeze({
        type: 'resume',
        confidence: Math.min(0.98, 0.72 + resumeSignals.length * 0.07),
        signals: Object.freeze(resumeSignals),
      });
    }
    return Object.freeze({
      type: 'pdf',
      confidence: 0.8,
      signals: Object.freeze(['general_pdf_document']),
    });
  }

  if (declaredType === 'project_description') {
    return Object.freeze({
      type: 'project',
      confidence: 1,
      signals: Object.freeze(['user_declared_project_description']),
    });
  }

  const projectSignals = matchingSignals(text, projectPatterns);
  if (projectSignals.length === projectPatterns.length) {
    return Object.freeze({
      type: 'project',
      confidence: 0.9,
      signals: Object.freeze(projectSignals),
    });
  }

  const careerSignals = matchingSignals(text, careerPatterns);
  if (careerSignals.length > 0) {
    return Object.freeze({
      type: 'career_goal',
      confidence: careerSignals.length === careerPatterns.length ? 0.9 : 0.78,
      signals: Object.freeze(careerSignals),
    });
  }

  return Object.freeze({
    type: 'learning_goal',
    confidence: 0.7,
    signals: Object.freeze(['general_learning_language']),
  });
}
