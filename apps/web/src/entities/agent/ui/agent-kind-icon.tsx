import {
  BotIcon,
  CrownIcon,
  GitForkIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";

import { AGENT_KIND_LABEL } from "../model/agent-kind-label";
import { type AgentKind } from "../model/types";

const ICON: Record<AgentKind, LucideIcon> = {
  main: BotIcon,
  subagent: GitForkIcon,
  team_lead: CrownIcon,
  teammate: UsersIcon,
  workflow_node: WorkflowIcon,
};

interface AgentKindIconProps {
  kind: AgentKind;
  /** show the text label next to the icon (otherwise it is screen-reader only) */
  labelled?: boolean;
  className?: string;
}

/** Icon + label for an agent's kind — the label is always available to assistive tech. */
export function AgentKindIcon({ kind, labelled = false, className }: AgentKindIconProps) {
  const Icon = ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase",
        className,
      )}
    >
      <Icon className="size-3.5 text-phosphor" aria-hidden="true" />
      <span className={labelled ? undefined : "sr-only"}>{AGENT_KIND_LABEL[kind]}</span>
    </span>
  );
}
