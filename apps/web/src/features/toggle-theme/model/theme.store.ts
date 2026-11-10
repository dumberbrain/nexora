import { createJSONStorage, persist } from "zustand/middleware";

import { createResettableStore } from "@/shared/lib/create-resettable-store";
import { safeLocalStorage } from "@/shared/lib/safe-storage";

export type ThemePref = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY).matches : true;
}

export function resolveTheme(pref: ThemePref, systemDark = systemPrefersDark()): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

interface ThemeState {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  /** re-evaluate `system` after the OS theme changed */
  syncSystem: () => void;
  reset: () => void;
}

const DEFAULT_PREF: ThemePref = "dark";

export const useThemeStore = createResettableStore<ThemeState, [["zustand/persist", unknown]]>(
  persist(
    (set, get, api) => ({
      pref: DEFAULT_PREF,
      resolved: "dark",
      setPref: (pref) => set({ pref, resolved: resolveTheme(pref) }),
      syncSystem: () => set({ resolved: resolveTheme(get().pref) }),
      reset: () => {
        set({ pref: DEFAULT_PREF, resolved: resolveTheme(DEFAULT_PREF) });
        void api.persist.clearStorage();
      },
    }),
    {
      name: "ubuliera-theme:v1",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ pref: s.pref }),
      onRehydrateStorage: () => (state) => state?.syncSystem(),
    },
  ),
);

function applyToDocument(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

/**
 * Keep <html> in sync with the theme store and the OS colour scheme. Called once at bootstrap
 * (an external-system sync, so it lives outside React effects). Returns a cleanup function.
 */
export function initThemeSync(): () => void {
  const state = useThemeStore.getState();
  state.syncSystem();
  applyToDocument(useThemeStore.getState().resolved);
  const unsubscribe = useThemeStore.subscribe((s, prev) => {
    if (s.resolved !== prev.resolved) applyToDocument(s.resolved);
  });
  const mql = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  const onChange = () => useThemeStore.getState().syncSystem();
  mql?.addEventListener("change", onChange);
  return () => {
    unsubscribe();
    mql?.removeEventListener("change", onChange);
  };
}
