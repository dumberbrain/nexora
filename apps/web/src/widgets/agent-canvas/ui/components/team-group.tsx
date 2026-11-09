import { type NodeProps } from "@xyflow/react";
import { UsersIcon } from "lucide-react";

import { STATUS_LABEL, toStatusKind } from "@/entities/status";

import { TEAM_HEADER, type TeamGroupFlowNode } from "../../lib/team-groups";

/**
 * Agent Teams frame (US6, T142): the lead and its teammates drawn as one team, with every
 * member's status in the header. Membership comes from the agents Nexora observed.
 */
export function TeamGroup({ data }: NodeProps<TeamGroupFlowNode>) {
  const { lead, members } = data;
  return (
    <div
      role="group"
      aria-label={`Agent team led by ${lead.name}`}
      className="pointer-events-none size-full border border-dashed border-phosphor/50 bg-phosphor/5 font-mono text-[11px]"
    >
      <div
        style={{ height: TEAM_HEADER }}
        className="flex flex-col gap-1 overflow-hidden px-3 py-1.5"
      >
        <p className="flex items-center gap-1.5 tracking-widest text-phosphor uppercase">
          <UsersIcon aria-hidden="true" className="size-3.5" />
          team · {members.length} members
        </p>
        <ul aria-label="Team members" className="flex flex-wrap gap-x-3 text-muted-foreground">
          {members.map((m) => (
            <li key={m.id}>
              <span className="text-foreground">{m.name}</span>
              {m.id === lead.id ? " (lead)" : ""}: {STATUS_LABEL[toStatusKind(m.status)]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
