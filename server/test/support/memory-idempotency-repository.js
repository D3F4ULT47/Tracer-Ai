/** In-memory stand-in for `idempotencyRepository` with the same claim and update semantics. */
export function memoryIdempotencyRepository() {
  const records = new Map();
  let nextId = 1;
  const id = ({ scope, endpoint, key }) => `${scope}|${endpoint}|${key}`;
  const byId = (recordId) => [...records.values()].find((record) => record._id === recordId);
  return {
    records,
    async claim(data) {
      const existing = records.get(id(data));
      if (existing) return { record: { ...existing }, created: false };
      const record = { ...data, _id: nextId++, status: 'processing', updatedAt: new Date() };
      records.set(id(data), record);
      return { record: { ...record }, created: true };
    },
    async find(lookup) {
      const record = records.get(id(lookup));
      return record ? { ...record } : null;
    },
    async reclaimFailed(recordId) {
      const record = byId(recordId);
      if (record?.status !== 'failed') return false;
      record.status = 'processing';
      return true;
    },
    async reclaimStale(recordId, staleBefore) {
      const record = byId(recordId);
      if (record?.status !== 'processing' || !(record.updatedAt < staleBefore)) return false;
      record.updatedAt = new Date();
      return true;
    },
    async complete(recordId, responseStatus, body) {
      Object.assign(byId(recordId), {
        status: 'completed',
        responseStatus,
        responseBody: JSON.stringify(body),
      });
    },
    async fail(recordId) {
      byId(recordId).status = 'failed';
    },
  };
}
