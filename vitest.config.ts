import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Vitest 5: projects replace the old vitest.workspace.ts file.
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: { provider: "v8", reporter: ["text", "html"], exclude: ["**/*.gen.ts", "e2e/**"] },
    projects: [
      {
        test: {
          name: "contracts",
          root: r("./packages/contracts"),
          environment: "node",
          include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          root: r("./apps/server"),
          environment: "node",
          include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { "@": r("./apps/web/src") } },
        test: {
          name: "web",
          root: r("./apps/web"),
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts"],
          css: false,
        },
      },
    ],
  },
});
