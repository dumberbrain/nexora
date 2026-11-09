import { useId } from "react";

import { type WorkflowVersionMeta } from "@/entities/workflow";

interface VersionPickerProps {
  /** newest first */
  versions: WorkflowVersionMeta[];
  value: number;
  latest: number;
  onChange: (version: number) => void;
}

/** Version switcher; older versions open read-only but stay runnable. */
export function VersionPicker({ versions, value, latest, onChange }: VersionPickerProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Version
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-sm border border-input bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.version}>
            v{v.version}
            {v.version === latest ? " (latest)" : " (read-only)"}
          </option>
        ))}
      </select>
    </div>
  );
}
