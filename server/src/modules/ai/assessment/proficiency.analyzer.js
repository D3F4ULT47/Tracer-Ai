export function finalizeProficiencyAssessment(assessment, confidenceThreshold) {
  return Object.freeze({
    ...assessment,
    clarificationRequired: assessment.confidence < confidenceThreshold,
  });
}
