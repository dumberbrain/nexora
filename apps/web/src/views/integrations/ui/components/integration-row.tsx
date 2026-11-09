import { useId } from "react";

import { HEALTH_TONE, INTEGRATION_KIND_LABEL, type IntegrationItem } from "@/entities/integration";
import { cn } from "@/shared/lib/cn";
import { humanize } from "@/shared/lib/humanize";

import { McpTools } from "./mcp-tools";
import { MetadataFacts } from "./metadata-facts";
import { Tag } from "./tag";

const PERMISSION_TONE: Record<IntegrationItem["permissionStatus"], string> = {
  allowed: "border-phosphor/60 text-phosphor",
  ask: "border-status-paused/60 text-status-paused",
  denied: "border-destructive/60 text-destructive",
  needs_auth: "border-status-waiting/60 text-status-waiting",
};

/** One discovered skill / command / agent / MCP server with its scope, health and permission. */
export function IntegrationRow({ item }: { item: IntegrationItem }) {
  const nameId = useId();
  const isSkillLike = item.kind === "skill" || item.kind === "command";
  return (
    <li aria-labelledby={nameId} className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span id={nameId} className="font-mono text-sm text-foreground">
          {item.name}
        </span>
        {isSkillLike ? <Tag>{INTEGRATION_KIND_LABEL[item.kind]}</Tag> : null}
        <Tag>{`scope: ${item.scope}`}</Tag>
        {isSkillLike ? (
          <Tag className={item.executable ? "border-phosphor/60 text-phosphor" : ""}>
            {item.executable ? "executable" : "not executable"}
          </Tag>
        ) : null}
        <Tag className={HEALTH_TONE[item.health]}>{`health: ${item.health}`}</Tag>
        <Tag className={PERMISSION_TONE[item.permissionStatus]}>
          {`permission: ${humanize(item.permissionStatus)}`}
        </Tag>
      </div>
      {item.healthDetail ? (
        <p className={cn("font-mono text-xs", HEALTH_TONE[item.health])}>{item.healthDetail}</p>
      ) : null}
      {item.description ? (
        <p className="text-sm text-muted-foreground">{item.description}</p>
      ) : null}
      {item.sourcePath ? (
        <p className="font-mono text-[11px] break-all text-muted-foreground">{item.sourcePath}</p>
      ) : null}
      <MetadataFacts metadata={item.metadata} />
      {item.kind === "mcp_server" ? <McpTools server={item.name} tools={item.tools} /> : null}
    </li>
  );
}
