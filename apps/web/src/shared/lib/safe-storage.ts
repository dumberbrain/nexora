import { type StateStorage } from "zustand/middleware";

/**
 * localStorage that never throws (private mode, blocked site data, previews). Used only for
 * per-viewer conveniences like the theme — the app must work without it.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* storage unavailable — keep working in memory */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
