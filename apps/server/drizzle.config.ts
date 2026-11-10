import { homedir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "drizzle-kit";

const dataDir = process.env.UBULIERA_DATA_DIR ?? join(homedir(), ".ubuliera");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: join(dataDir, "ubuliera.db") },
  strict: true,
  verbose: true,
});
