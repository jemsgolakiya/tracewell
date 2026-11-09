const store = new Map();
export const kvs = {
  get: async (k) => (store.has(k) ? structuredClone(store.get(k)) : undefined),
  set: async (k, v) => { store.set(k, structuredClone(v)); },
  delete: async (k) => { store.delete(k); },
};
export const _store = store;
