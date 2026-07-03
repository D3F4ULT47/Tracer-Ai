const enabledValue = 'true';

function missingEnvironmentVariables(requiredEnvironment, environment) {
  return requiredEnvironment.filter((name) => !environment[name]?.trim());
}

export function createLiveTestGate({ name, requiredEnvironment = [] }, environment = process.env) {
  if (environment.ENABLE_LIVE_TESTS !== enabledValue) {
    return Object.freeze({
      enabled: false,
      skipReason: `${name} live test disabled; set ENABLE_LIVE_TESTS=true to opt in`,
    });
  }

  const missing = missingEnvironmentVariables(requiredEnvironment, environment);
  if (missing.length > 0) {
    return Object.freeze({
      enabled: false,
      skipReason: `${name} live test missing required environment: ${missing.join(', ')}`,
    });
  }

  return Object.freeze({ enabled: true, skipReason: false });
}

export function requireTestDatabase(gate, uri) {
  if (!gate.enabled) return gate;

  let databaseName;
  try {
    databaseName = new URL(uri).pathname.split('/').filter(Boolean).at(-1);
  } catch {
    return Object.freeze({
      enabled: false,
      skipReason: 'MongoDB live test requires a valid MONGODB_TEST_URI',
    });
  }

  if (!databaseName?.endsWith('_test')) {
    return Object.freeze({
      enabled: false,
      skipReason: 'MongoDB live test database name must end with _test',
    });
  }

  return gate;
}
