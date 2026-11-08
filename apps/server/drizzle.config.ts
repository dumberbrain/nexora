import { homedir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "drizzle-kit";

const dataDir = process.env.NEXORA_DATA_DIR ?? join(homedir(), ".nexora");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: join(dataDir, "nexora.db") },
  strict: true,
  verbose: true,
});
