import { useQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";

import { groupIntegrations, integrationListQuery } from "@/entities/integration";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format-time";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { IntegrationList } from "./components/integration-list";
import { ProjectFilter } from "./components/project-filter";
import {
  INTEGRATION_TABS,
  toFilters,
  type IntegrationsSearch,
  type IntegrationTab,
} from "../model/integrations-search";
import { useRefreshIntegrations } from "../model/use-refresh-integrations";

interface IntegrationsViewProps {
  search: IntegrationsSearch;
  onSearchChange: (next: IntegrationsSearch) => void;
}

const TAB_COPY: Record<IntegrationTab, { label: string; empty: string; hint: string }> = {
  skills: {
    label: "Skills",
    empty: "No skills or commands discovered",
    hint: "Add skills under .claude/skills or commands under .claude/commands, then refresh.",
  },
  agents: {
    label: "Agents",
    empty: "No agent definitions discovered",
    hint: "Agent definitions live in .claude/agents (user, project or plugin scope).",
  },
  mcp: {
    label: "MCP servers",
    empty: "No MCP servers configured",
    hint: "Configure servers in .mcp.json or your Claude Code settings, then refresh.",
  },
};

const isTab = (v: string): v is IntegrationTab =>
  (INTEGRATION_TABS as readonly string[]).includes(v);

/** Skills, agents and MCP servers available to Claude Code (US7, FR-014/FR-052). Read-only. */
export function IntegrationsView({ search, onSearchChange }: IntegrationsViewProps) {
  const filters = toFilters(search);
  const inventory = useQuery(integrationListQuery(filters));
  const refresh = useRefreshIntegrations(filters);
  const tab = search.tab ?? "skills";
  const groups = groupIntegrations(inventory.data?.items ?? []);

  const setProject = (projectId: string | undefined) => {
    const { projectId: _drop, ...rest } = search;
    onSearchChange(projectId ? { ...rest, projectId } : rest);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="08"
        title="Skills & MCP"
        description="Skills, commands, agent definitions and MCP servers Claude Code can use, with scope, health and permission status. Secrets are never shown."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            aria-busy={refresh.isPending}
          >
            <RefreshCwIcon aria-hidden="true" className={cn(refresh.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ProjectFilter value={search.projectId} onChange={setProject} />
        {inventory.data?.discoveredAt ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            discovered {formatDateTime(inventory.data.discoveredAt)}
          </p>
        ) : null}
      </div>
      {refresh.isError ? (
        <ErrorState title="Refresh failed" error={refresh.error} onRetry={() => refresh.mutate()} />
      ) : null}
      {inventory.isPending ? <LoadingState label="Loading integrations" rows={4} /> : null}
      {inventory.isError ? (
        <ErrorState
          title="Integrations unavailable"
          error={inventory.error}
          onRetry={() => void inventory.refetch()}
        />
      ) : null}
      {inventory.data ? (
        <Tabs value={tab} onValueChange={(v) => isTab(v) && onSearchChange({ ...search, tab: v })}>
          <TabsList variant="line">
            {INTEGRATION_TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_COPY[t].label}
                <span aria-hidden="true" className="font-mono text-[10px] text-muted-foreground">
                  {groups[t].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {INTEGRATION_TABS.map((t) => (
            <TabsContent key={t} value={t}>
              <IntegrationList
                label={TAB_COPY[t].label}
                items={groups[t]}
                emptyTitle={TAB_COPY[t].empty}
                emptyDescription={TAB_COPY[t].hint}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
