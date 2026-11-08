import { create, type StateCreator, type StoreMutatorIdentifier } from "zustand";

type Resettable = { reset: () => void };

const resetters = new Set<() => void>();

/** Calls reset() on every registered store (session end / remote logout). */
export function resetAllStores(): void {
  resetters.forEach((reset) => reset());
}

/** Register an externally created store. Returns an unregister function. */
export function registerResettable(reset: () => void): () => void {
  resetters.add(reset);
  return () => resetters.delete(reset);
}

/** Every feature store is created through this so it can be reset in one place. */
export function createResettableStore<
  T extends Resettable,
  Mos extends [StoreMutatorIdentifier, unknown][] = [],
>(initializer: StateCreator<T, [], Mos>) {
  const useStore = create<T>()(initializer);
  registerResettable(() => useStore.getState().reset());
  return useStore;
}
