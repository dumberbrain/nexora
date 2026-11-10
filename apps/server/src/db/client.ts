import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/**
 * Migrations live in apps/server/drizzle. This module runs either as src/db/client.ts (tsx,
 * tests) or bundled into dist/main.js, so resolve relative to whichever it is.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = here.endsWith(join("src", "db"))
  ? resolve(here, "..", "..", "drizzle")
  : resolve(here, "..", "drizzle");

export interface OpenDbOptions {
  /** directory for ubuliera.db; the literal ":memory:" opens an in-memory database (tests) */
  dataDir: string;
  migrate?: boolean;
}

/** Open SQLite with WAL + foreign keys and (by default) apply pending migrations. */
export function openDb(opts: OpenDbOptions): Db {
  let file: string;
  if (opts.dataDir === ":memory:") {
    file = ":memory:";
  } else {
    mkdirSync(opts.dataDir, { recursive: true });
    file = join(opts.dataDir, "ubuliera.db");
  }
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const db: Db = drizzle(sqlite, { schema });
  if (opts.migrate !== false) migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export function closeDb(db: Db): void {
  db.$client.close();
}

/** Cheap liveness probe for /health. */
export function pingDb(db: Db): boolean {
  try {
    db.$client.prepare("select 1").get();
    return true;
  } catch {
    return false;
  }
}
