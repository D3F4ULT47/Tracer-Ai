export class ScoringRuleRegistry {
  #rules = new Map();

  register(rule) {
    if (!rule?.name || typeof rule.score !== 'function') {
      throw new Error('Scoring rules require name and score');
    }
    if (this.#rules.has(rule.name))
      throw new Error(`Scoring rule already registered: ${rule.name}`);
    this.#rules.set(rule.name, Object.freeze({ version: '1.0.0', ...rule }));
    return this;
  }

  list() {
    return [...this.#rules.values()];
  }
}
