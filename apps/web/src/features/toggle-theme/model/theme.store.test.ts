import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initThemeSync, resolveTheme, useThemeStore } from "./theme.store";

let systemDark = true;
const listeners = new Set<() => void>();

beforeEach(() => {
  systemDark = true;
  listeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    })),
  );
  useThemeStore.getState().reset();
});

afterEach(() => vi.unstubAllGlobals());

describe("theme", () => {
  it("defaults to dark", () => {
    expect(useThemeStore.getState().pref).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies the resolved theme to <html> and follows changes", () => {
    const stop = initThemeSync();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useThemeStore.getState().setPref("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    stop();
  });

  it("follows the OS when set to system", () => {
    const stop = initThemeSync();
    useThemeStore.getState().setPref("system");
    expect(useThemeStore.getState().resolved).toBe("dark");
    systemDark = false;
    listeners.forEach((fn) => fn());
    expect(useThemeStore.getState().resolved).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    stop();
  });

  it("keeps working when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => useThemeStore.getState().setPref("light")).not.toThrow();
    expect(useThemeStore.getState().pref).toBe("light");
    spy.mockRestore();
  });
});
