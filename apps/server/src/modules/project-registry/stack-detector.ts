import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { type DetectedStack } from "@ubuliera/contracts";
import { z } from "zod";

/**
 * Minimal, honest stack detection from well-known manifest files in the project root. It only
 * reports what a file states; it never guesses from directory names (FR-002 deeper analysis is
 * US2's job).
 */

const MAX_MANIFEST_BYTES = 1024 * 1024;

const PackageJsonSchema = z.looseObject({
  packageManager: z.string().optional(),
  dependencies: z.record(z.string(), z.unknown()).optional(),
  devDependencies: z.record(z.string(), z.unknown()).optional(),
});

const JS_FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
];
const JS_TEST_RUNNERS: [string, string][] = [
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["mocha", "Mocha"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
];
const LOCKFILES: [string, string][] = [
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["uv.lock", "uv"],
  ["poetry.lock", "poetry"],
  ["Cargo.lock", "cargo"],
];
const LANGUAGE_MARKERS: [string, string][] = [
  ["tsconfig.json", "TypeScript"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "Python"],
  ["setup.py", "Python"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pom.xml", "Java"],
  ["build.gradle", "Java"],
  ["build.gradle.kts", "Kotlin"],
  ["Gemfile", "Ruby"],
  ["composer.json", "PHP"],
];

export const INSTRUCTION_FILES = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", "AGENTS.md"];

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readSmall(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size > MAX_MANIFEST_BYTES) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parsePackageJson(text: string | null): z.infer<typeof PackageJsonSchema> | null {
  if (text === null) return null;
  try {
    const parsed = PackageJsonSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function detectStack(root: string): Promise<DetectedStack> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const testRunners = new Set<string>();
  let packageManager: string | undefined;

  const pkg = parsePackageJson(await readSmall(join(root, "package.json")));
  if (pkg) {
    languages.add("JavaScript");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("typescript" in deps) languages.add("TypeScript");
    for (const [dep, name] of JS_FRAMEWORKS) if (dep in deps) frameworks.add(name);
    for (const [dep, name] of JS_TEST_RUNNERS) if (dep in deps) testRunners.add(name);
    packageManager = pkg.packageManager?.split("@")[0] || undefined;
  }

  for (const [file, lang] of LANGUAGE_MARKERS) {
    if (await isFile(join(root, file))) languages.add(lang);
  }
  for (const [file, pm] of LOCKFILES) {
    if (packageManager === undefined && (await isFile(join(root, file)))) packageManager = pm;
  }
  if (languages.has("Python")) {
    const manifests = await Promise.all(
      ["pyproject.toml", "requirements.txt"].map((f) => readSmall(join(root, f))),
    );
    if (manifests.some((m) => m !== null && /\bpytest\b/.test(m))) testRunners.add("pytest");
  }
  if (languages.has("Go")) packageManager ??= "go";

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    ...(packageManager === undefined ? {} : { packageManager }),
    testRunners: [...testRunners],
  };
}

/** Project-relative paths (forward slashes) of instruction files that exist. */
export async function detectInstructionFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const rel of INSTRUCTION_FILES) {
    if (await isFile(join(root, ...rel.split("/")))) found.push(rel);
  }
  return found;
}
