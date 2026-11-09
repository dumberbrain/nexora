import { useQuery } from "@tanstack/react-query";

import { teamViewQuery, type TeamView } from "@/entities/team";
import { ApiError } from "@/shared/api";
import { ErrorState, LoadingState } from "@/shared/ui/state";

const MUTED = "font-mono text-xs text-muted-foreground";
const MEMBER_TONE = {
  active: "text-phosphor",
  idle: "text-muted-foreground",
  left: "text-status-stopped",
} as const;

/**
 * Team members, shared task list and recent inbox traffic of the Agent Teams lead session
 * (US6, GET /sessions/:id/team). Read from Claude Code's team files — best effort, polled.
 */
export function TeamOverview({ sessionId }: { sessionId: string }) {
  const team = useQuery(teamViewQuery(sessionId));

  if (team.isPending) return <LoadingState label="Loading the team" rows={3} />;
  if (team.isError) {
    if (team.error instanceof ApiError && team.error.status === 404) {
      return (
        <p className={MUTED}>
          No team has been created yet — the lead creates it when its session starts.
        </p>
      );
    }
    return (
      <ErrorState title="Team unavailable" error={team.error} onRetry={() => void team.refetch()} />
    );
  }
  return <TeamBody team={team.data} />;
}

function TeamBody({ team }: { team: TeamView }) {
  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-foreground">{team.teamName}</span>
        <span
          title="Read from ~/.claude/teams — inboxes are emptied within seconds, so this can miss updates"
          className="border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase"
        >
          best effort
        </span>
      </p>
      <ul aria-label="Teammate statuses" className="flex flex-col gap-1">
        {team.members.map((m) => (
          <li key={m.agentId} className="flex flex-wrap gap-x-2">
            <span className="text-foreground">{m.name}</span>
            <span className="text-muted-foreground">{m.isLead ? "lead" : m.agentType}</span>
            <span className={MEMBER_TONE[m.status]}>{m.status}</span>
          </li>
        ))}
      </ul>
      {team.tasks.length === 0 ? (
        <p className={MUTED}>No shared tasks — the lead has not used the team task list.</p>
      ) : (
        <table aria-label="Team tasks" className="w-full border-collapse text-left">
          <thead className="text-[10px] tracking-widest text-muted-foreground uppercase">
            <tr>
              <th className="py-1 pr-2 font-normal">Task</th>
              <th className="py-1 pr-2 font-normal">Status</th>
              <th className="py-1 font-normal">Owner</th>
            </tr>
          </thead>
          <tbody>
            {team.tasks.map((t) => (
              <tr key={t.id} className="border-t border-border align-top">
                <td className="py-1 pr-2 text-foreground">{t.subject}</td>
                <td className="py-1 pr-2">{t.status}</td>
                <td className="py-1">
                  {t.owner ?? <span className="text-muted-foreground">none</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {team.messages.length > 0 ? (
        <ul aria-label="Recent team messages" className="flex flex-col gap-1 text-muted-foreground">
          {team.messages.map((msg) => (
            <li key={msg.id}>
              <span className="text-foreground">{msg.from}</span> → {msg.to}: {msg.summary}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
