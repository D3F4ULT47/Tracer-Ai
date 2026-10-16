export const PIPELINE_ID_HEADER = 'x-tracer-pipeline-id';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pipelineIdFrom(request) {
  const value = request.get?.(PIPELINE_ID_HEADER);
  return typeof value === 'string' && uuidPattern.test(value) ? value.toLowerCase() : null;
}
