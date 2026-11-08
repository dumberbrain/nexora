// Single flat config for the monorepo (ESLint 9 resolves config from cwd upward, so workspace
// `lint` scripts and root lint-staged both use this file).
// apps/web follows team-front profile `shadcn-tailwind-tanstack-router` (tooling.md), paths
// prefixed with apps/web/. Server + contracts get a Node block with the same team rules.
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const WEB = "apps/web";
const webFiles = [`${WEB}/src/**/*.{ts,tsx}`, `${WEB}/tests/**/*.{ts,tsx}`];
const nodeFiles = [
  "apps/server/src/**/*.ts",
  "apps/server/tests/**/*.ts",
  "apps/server/scripts/**/*.ts",
  "packages/contracts/src/**/*.ts",
  "packages/contracts/tests/**/*.ts",
];

/** One FSD layer policy: files of layer `from` may import only the listed layers. */
const fsd = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: to } } },
});

const teamRules = {
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "warn",
    { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
  ],
  "import/order": [
    "warn",
    {
      groups: ["builtin", "external", "internal", ["parent", "sibling"], "index", "type"],
      "newlines-between": "always",
      alphabetize: { order: "asc", caseInsensitive: true },
    },
  ],
  "import/no-duplicates": ["error", { "prefer-inline": true }],
  eqeqeq: ["error", "always"],
  "prefer-const": "error",
  "no-var": "error",
  "no-debugger": "error",
};

export default defineConfig(
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "playwright-report/**",
    "test-results/**",
    `${WEB}/src/shared/ui/**`, // shadcn sources
    `${WEB}/src/routeTree.gen.ts`,
    "apps/server/drizzle/**",
    ".specify/**",
    ".claude/**",
  ]),
  tseslint.configs.recommended,

  // ---------- server + contracts (Node) ----------
  {
    files: nodeFiles,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { import: importPlugin, "unused-imports": unusedImports },
    settings: { "import/resolver": { typescript: true, node: true } },
    rules: {
      ...teamRules,
      // server logs through pino (lib/logger) so secrets get redacted
      "no-console": "error",
    },
  },

  // ---------- web (team-front shadcn-tailwind-tanstack-router) ----------
  pluginQuery.configs["flat/recommended"],
  pluginRouter.configs["flat/recommended"],
  {
    files: webFiles,
    extends: [
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      boundaries,
      import: importPlugin,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": { typescript: { project: `${WEB}/tsconfig.json` }, node: true },
      "import/internal-regex": "^@/",
      "boundaries/elements": [
        { type: "app", pattern: `${WEB}/src/app/*` },
        { type: "routes", pattern: `${WEB}/src/routes/*` },
        { type: "views", pattern: `${WEB}/src/views/*`, capture: ["slice"] },
        { type: "widgets", pattern: `${WEB}/src/widgets/*`, capture: ["slice"] },
        { type: "features", pattern: `${WEB}/src/features/*`, capture: ["slice"] },
        { type: "entities", pattern: `${WEB}/src/entities/*`, capture: ["slice"] },
        { type: "shared", pattern: `${WEB}/src/shared/*` },
      ],
    },
    rules: {
      ...teamRules,
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "axios", message: "Use http from @/shared/api" }],
          patterns: [
            {
              group: ["@/views/*/*", "@/widgets/*/*", "@/features/*/*", "@/entities/*/*"],
              message: "Import slices only through their public API (index.ts)",
            },
          ],
        },
      ],
      // FSD layer policy (eslint-plugin-boundaries v7 syntax; same rules as team-front tooling.md)
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            fsd("routes", ["views", "app", "shared"]),
            fsd("app", ["routes", "views", "widgets", "features", "entities", "shared"]),
            fsd("views", ["widgets", "features", "entities", "shared"]),
            fsd("widgets", ["features", "entities", "shared"]),
            fsd("features", ["entities", "shared"]),
            fsd("entities", ["shared"]),
            fsd("shared", ["shared"]),
          ],
        },
      ],
    },
  },
  {
    files: [`${WEB}/src/shared/api/**`],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // route files export `Route`, not a component — Fast Refresh rule doesn't apply
    files: [`${WEB}/src/routes/**`],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: [`${WEB}/**/*.tsx`],
    ignores: ["**/*.test.tsx"],
    rules: { "max-lines": ["error", { max: 150, skipBlankLines: true, skipComments: true }] },
  },
  prettier,
);
