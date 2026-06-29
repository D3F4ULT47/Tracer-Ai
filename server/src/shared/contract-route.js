import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, removeAdditional: false });
addFormats(ajv);

export function registerContractRoute(router, contract, ...handlers) {
  const validators = {
    body: contract.bodySchema ? ajv.compile(contract.bodySchema) : null,
    params: contract.paramsSchema ? ajv.compile(contract.paramsSchema) : null,
    response: contract.responseSchema ? ajv.compile(contract.responseSchema) : null,
  };

  const validate = (request, response, next) => {
    for (const [location, validator] of Object.entries(validators)) {
      if (validator && !validator(request[location])) {
        response.status(400).json({
          success: false,
          message: 'Request validation failed',
          error: { code: 'VALIDATION_ERROR', details: validator.errors },
          requestId: request.id,
        });
        return;
      }
    }
    next();
  };

  const validateResponse = (request, response, next) => {
    const sendJson = response.json.bind(response);
    response.json = (payload) => {
      if (payload?.success === true && validators.response && !validators.response(payload)) {
        const error = new Error(`Response contract failed for ${contract.id}`);
        error.details = validators.response.errors;
        next(error);
        return response;
      }
      return sendJson(payload);
    };
    next();
  };

  router[contract.method.toLowerCase()](contract.path, validate, validateResponse, ...handlers);
}
