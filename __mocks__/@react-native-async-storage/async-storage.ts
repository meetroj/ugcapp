/**
 * In-memory stand-in for AsyncStorage. The real package talks to a native
 * module that does not exist under Jest, and it ships untranspiled ESM.
 */
const store = new Map<string, string>();

export default {
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  /** Test helper: drops everything between cases. */
  __reset: () => store.clear(),
};
