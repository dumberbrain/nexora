/** `npm run db:migrate` — apply pending migrations to the configured data dir and exit. */
import { closeDb, openDb } from "./client";
import { loadEnv } from "../config/env";
import { logger } from "../lib/logger";

const env = loadEnv();
const db = openDb({ dataDir: env.dataDir, migrate: true });
closeDb(db);
logger.info({ dataDir: env.dataDir }, "migrations applied");
