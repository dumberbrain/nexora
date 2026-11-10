import { ShieldAlertIcon } from "lucide-react";

import { type Settings } from "@/entities/settings";
import { McpServerSwitch } from "@/features/toggle-mcp-server";

import { Section } from "./section";

/** FR-043: optional MCP server — off by default, Streamable HTTP on the same process. */
export function McpSection({ mcp }: { mcp: Settings["mcp"] }) {
  return (
    <Section
      title="MCP server"
      description="Lets MCP clients such as Claude Code query sessions, agents, tasks and logs, and drive executions, through the same services as this dashboard. Disabled by default; clients authenticate with an API token below and every call is audited."
    >
      <McpServerSwitch enabled={mcp.enabled} />
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Endpoint (Streamable HTTP)
        </span>
        <code className="w-fit border border-border bg-terminal px-2 py-1 font-mono text-sm break-all">
          {mcp.endpoint}
        </code>
      </div>
      <p className="flex items-start gap-2 font-mono text-xs text-status-waiting">
        <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Control tokens can plan, start and stop executions, but they never approve risky tasks —
        those wait for a human decision in the approvals inbox.
      </p>
    </Section>
  );
}
