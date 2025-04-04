import { StoreApi, UseBoundStore } from 'zustand';

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

/**
 * Create selectors for each state property in the store.
 * This allows you to access the state properties
 * using the `use` property of the store.
 *
 * For example:
 * ```ts
 * const store = createStore();
 * const selectors = createSelectors(store);
 *
 * selectors.use.propertyName();
 * ```
 */
export const createSelectors = <S extends UseBoundStore<StoreApi<object>>>(_store: S) => {
  const store = _store as WithSelectors<typeof _store>;
  store.use = {};
  for (const k of Object.keys(store.getState())) {
    // skip keys starting with `_` as they are private
    if (k.startsWith('_')) continue;

    (store.use as any)[k] = () => store((s) => s[k as keyof typeof s]);
  }

  return store;
};
