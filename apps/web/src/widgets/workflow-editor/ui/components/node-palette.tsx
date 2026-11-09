import {
  BotIcon,
  GitForkIcon,
  GitMergeIcon,
  PlugIcon,
  ShieldCheckIcon,
  SplitIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";

import { NODE_KIND_LABEL, PALETTE_KINDS, type WorkflowNodeKind } from "@/entities/workflow";
import { Button } from "@/shared/ui/button";

const ICON: Record<(typeof PALETTE_KINDS)[number], LucideIcon> = {
  agent: BotIcon,
  skill: WandSparklesIcon,
  mcp_tool: PlugIcon,
  condition: SplitIcon,
  approval: ShieldCheckIcon,
  parallel_fork: GitForkIcon,
  parallel_join: GitMergeIcon,
};

/** Node palette: plain buttons, so adding a node works from the keyboard (no drag needed). */
export function NodePalette({ onAdd }: { onAdd: (kind: WorkflowNodeKind) => void }) {
  return (
    <section aria-labelledby="wf-palette" className="flex flex-col gap-2">
      <h2 id="wf-palette" className="text-index font-mono text-[11px] tracking-widest uppercase">
        Add node
      </h2>
      <ul className="flex flex-wrap gap-1.5 lg:flex-col">
        {PALETTE_KINDS.map((kind) => {
          const Icon = ICON[kind];
          return (
            <li key={kind}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start rounded-sm font-mono text-xs"
                aria-label={`Add ${NODE_KIND_LABEL[kind]} node`}
                onClick={() => onAdd(kind)}
              >
                <Icon aria-hidden="true" />
                {NODE_KIND_LABEL[kind]}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
