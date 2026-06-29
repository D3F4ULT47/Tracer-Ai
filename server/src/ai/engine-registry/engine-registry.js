const requiredDefinitionKeys = [
  'name',
  'version',
  'inputSchema',
  'outputSchema',
  'supports',
  'createHandler',
];

export class EngineRegistry {
  #engines = new Map();

  register(definition) {
    for (const key of requiredDefinitionKeys) {
      if (!(key in definition)) {
        throw new Error(`AI engine definition is missing ${key}`);
      }
    }

    if (this.#engines.has(definition.name)) {
      throw new Error(`AI engine already registered: ${definition.name}`);
    }

    if (
      typeof definition.name !== 'string' ||
      typeof definition.version !== 'string' ||
      !Array.isArray(definition.supports) ||
      typeof definition.createHandler !== 'function'
    ) {
      throw new Error('AI engine definition contains invalid field types');
    }

    this.#engines.set(
      definition.name,
      Object.freeze({ ...definition, supports: Object.freeze([...definition.supports]) }),
    );
    return this;
  }

  get(name) {
    const engine = this.#engines.get(name);

    if (!engine) {
      throw new Error(`AI engine is not registered: ${name}`);
    }

    return engine;
  }

  list() {
    return Object.freeze([...this.#engines.values()]);
  }
}

export const engineRegistry = new EngineRegistry();
