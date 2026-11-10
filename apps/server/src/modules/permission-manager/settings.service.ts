import { MCP_ENDPOINT_PATH, type Settings } from "@ubuliera/contracts";
import { eq } from "drizzle-orm";

import { type AuditService } from "./audit.service";
import { type UbulieraEnv } from "../../config/env";
import { type Db } from "../../db/client";
import { settings } from "../../db/schema";

export const MCP_ENABLED_KEY = "mcp.enabled";

export interface SettingsServiceDeps {
  db: Db;
  audit: AuditService;
  env: Pick<UbulieraEnv, "remote" | "host" | "port" | "token" | "publicUrl">;
  now?: () => number;
}

/**
 * User settings (US8): the optional MCP server switch — off unless the user turned it on — plus
 * a read-only view of remote access, which only env vars configure (FR-050). The env token
 * itself is never exposed, only whether one is configured.
 */
export class SettingsService {
  private readonly now: () => number;

  constructor(private readonly deps: SettingsServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Read on every MCP request, so toggling takes effect immediately. */
  mcpEnabled(): boolean {
    const row = this.deps.db.select().from(settings).where(eq(settings.key, MCP_ENABLED_KEY)).get();
    return row?.value === true;
  }

  setMcpEnabled(enabled: boolean, actor: string): Settings {
    const previous = this.mcpEnabled();
    const updatedAt = this.now();
    this.deps.db
      .insert(settings)
      .values({ key: MCP_ENABLED_KEY, value: enabled, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: enabled, updatedAt } })
      .run();
    this.deps.audit.record({
      actor,
      action: "settings.mcp.update",
      targetType: "settings",
      targetId: MCP_ENABLED_KEY,
      outcome: "success",
      details: { enabled, previous },
    });
    return this.view();
  }

  view(): Settings {
    const { env } = this.deps;
    return {
      mcp: {
        enabled: this.mcpEnabled(),
        endpoint: `${env.publicUrl.replace(/\/+$/, "")}${MCP_ENDPOINT_PATH}`,
      },
      remote: {
        enabled: env.remote,
        host: env.host,
        port: env.port,
        envTokenConfigured: Boolean(env.token),
      },
    };
  }
}
