import { useQuery } from "@tanstack/react-query";

import { sessionListQuery } from "@/entities/session";

interface SessionPickerProps {
  value: string | undefined;
  onChange: (sessionId: string | undefined) => void;
}

/** Narrow the canvas to one session's agent tree. */
export function SessionPicker({ value, onChange }: SessionPickerProps) {
  const sessions = useQuery(sessionListQuery());
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
      session
      <select
        value={value ?? ""}
        disabled={!sessions.data}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 max-w-64 rounded-sm border border-input bg-background px-2 font-mono text-xs text-foreground normal-case"
      >
        <option value="">all sessions</option>
        {sessions.data?.items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id.slice(0, 8)} · {s.status} · {s.cwd}
          </option>
        ))}
      </select>
    </label>
  );
}
