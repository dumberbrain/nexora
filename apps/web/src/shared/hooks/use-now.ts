import { useSyncExternalStore } from "react";

/** One shared ticker for every relative timestamp on screen (external system: the clock). */
const TICK_MS = 5000;
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    for (const l of listeners) l();
  }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/** Current time in ms, re-rendering every 5 s while any component uses it. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
