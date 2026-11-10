import { useQuery } from "@tanstack/react-query";

import { settingsQuery } from "@/entities/settings";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { McpSection } from "./components/mcp-section";
import { RemoteSection } from "./components/remote-section";
import { TokensSection } from "./components/tokens-section";

/** US8 settings: optional MCP server, API tokens (secret shown once), remote-access status. */
export function SettingsView() {
  const settings = useQuery(settingsQuery());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="10"
        title="Settings"
        description="MCP server, API tokens for MCP clients and remote-access status. Changes here are audited."
      />
      {settings.isPending ? <LoadingState label="Loading settings" rows={3} /> : null}
      {settings.isError ? (
        <ErrorState
          title="Settings unavailable"
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      ) : null}
      {settings.data ? (
        <>
          <McpSection mcp={settings.data.mcp} />
          <TokensSection mcpEndpoint={settings.data.mcp.endpoint} />
          <RemoteSection remote={settings.data.remote} />
        </>
      ) : null}
    </div>
  );
}
