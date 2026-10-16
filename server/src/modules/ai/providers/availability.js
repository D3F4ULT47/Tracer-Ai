function keyOf(entry) {
  return `${entry.provider}:${entry.model}`;
}

/**
 * Skips a model after `threshold` consecutive availability failures for `cooldownMs`, then lets
 * one trial request through. Validation failures are not availability failures.
 */
export function createCircuitBreaker({
  threshold = 5,
  cooldownMs = 10 * 60_000,
  now = Date.now,
} = {}) {
  const states = new Map();

  return Object.freeze({
    isOpen(entry) {
      const state = states.get(keyOf(entry));
      if (!state?.openedAt) return false;
      if (now() - state.openedAt < cooldownMs) return true;
      if (state.trialInFlight) return true;
      state.trialInFlight = true;
      return false;
    },

    recordSuccess(entry) {
      states.delete(keyOf(entry));
    },

    recordFailure(entry) {
      const key = keyOf(entry);
      const state = states.get(key) ?? { failures: 0, openedAt: null, trialInFlight: false };
      state.failures += 1;
      if (state.trialInFlight || state.failures >= threshold) {
        state.openedAt = now();
        state.trialInFlight = false;
      }
      states.set(key, state);
    },

    reset() {
      states.clear();
    },
  });
}

/**
 * The OpenRouter daily free-model limit is account-wide. Once a daily 429 is seen, no free entry
 * is attempted until the reset time.
 */
export function createFreeQuotaTracker({ now = Date.now } = {}) {
  let exhaustedUntil = null;

  return Object.freeze({
    exhaustedUntil() {
      if (exhaustedUntil !== null && now() >= exhaustedUntil) exhaustedUntil = null;
      return exhaustedUntil;
    },

    markExhausted(retryAt) {
      const resetAt = Date.parse(retryAt);
      exhaustedUntil = Number.isFinite(resetAt) ? resetAt : now() + 60 * 60_000;
    },

    reset() {
      exhaustedUntil = null;
    },
  });
}

export const circuitBreaker = createCircuitBreaker();
export const freeQuotaTracker = createFreeQuotaTracker();
