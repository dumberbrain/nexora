import { type McpToolSummary } from "@/entities/integration";
import { humanize } from "@/shared/lib/humanize";

import { Tag } from "./tag";

interface McpToolsProps {
  server: string;
  tools: McpToolSummary[];
}

/** Tools an MCP server reported when it was reachable (name, description, permission). */
export function McpTools({ server, tools }: McpToolsProps) {
  if (tools.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">No tools reported</p>;
  }
  return (
    <ul
      aria-label={`Tools of ${server}`}
      className="flex flex-col gap-1 border-l border-border pl-3"
    >
      {tools.map((t) => (
        <li key={t.name} className="flex flex-wrap items-baseline gap-2">
          <code className="text-xs text-foreground">{t.name}</code>
          {t.description ? (
            <span className="text-xs text-muted-foreground">{t.description}</span>
          ) : null}
          <Tag>{`permission: ${humanize(t.permissionStatus)}`}</Tag>
        </li>
      ))}
    </ul>
  );
}
