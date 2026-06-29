export function defineEndpoint(definition) {
  const required = ['id', 'method', 'path'];
  for (const field of required) {
    if (!definition[field]) throw new Error(`Endpoint contract requires ${field}`);
  }
  const dataSchema = definition.dataSchema ?? { type: 'object', additionalProperties: false };
  return Object.freeze({
    auth: false,
    csrf: false,
    bodySchema: null,
    paramsSchema: null,
    ...definition,
    dataSchema,
    responseSchema: definition.responseSchema ?? {
      type: 'object',
      required: ['success', 'message', 'data'],
      properties: {
        success: { const: true },
        message: { type: 'string' },
        data: dataSchema,
        requestId: { type: 'string' },
      },
      additionalProperties: false,
    },
  });
}

export function buildContractPath(path, params = {}) {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) throw new Error(`Missing path parameter: ${key}`);
    return encodeURIComponent(params[key]);
  });
}
