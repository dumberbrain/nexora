import { EVENT_TYPES, EXECUTION_MODES, SEVERITIES } from "@nexora/contracts";
import { ChevronDownIcon } from "lucide-react";

import {
  type EventFilters,
  type EventType,
  type ExecutionMode,
  type Severity,
} from "@/entities/event";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

import { type FilterPatch } from "../../model/filter-patch";

type Facets = Pick<FilterPatch, "type" | "severity" | "mode">;

function toggle<T>(list: T[] | undefined, value: T): T[] | undefined {
  const next = list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];
  return next.length > 0 ? next : undefined;
}

interface FacetFiltersProps {
  filters: EventFilters;
  onChange: (patch: Facets) => void;
}

/** Event type (multi), severity (multi) and execution mode — applied immediately. */
export function FacetFilters({ filters, onChange }: FacetFiltersProps) {
  const types = filters.type ?? [];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-sm font-mono">
            type:{" "}
            {types.length === 0
              ? "all"
              : types.length === 1
                ? types[0]
                : `${types.length} selected`}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto font-mono text-xs">
          {EVENT_TYPES.values.map((t: EventType) => (
            <DropdownMenuCheckboxItem
              key={t}
              checked={types.includes(t)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ type: toggle(filters.type, t) })}
            >
              {t}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div role="group" aria-label="Severity" className="flex gap-1">
        {SEVERITIES.values.map((s: Severity) => {
          const on = filters.severity?.includes(s) ?? false;
          return (
            <Button
              key={s}
              size="xs"
              variant={on ? "secondary" : "ghost"}
              aria-pressed={on}
              className="rounded-sm font-mono uppercase"
              onClick={() => onChange({ severity: toggle(filters.severity, s) })}
            >
              {s}
            </Button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
        mode
        <select
          value={filters.mode ?? ""}
          onChange={(e) =>
            onChange({ mode: (e.target.value || undefined) as ExecutionMode | undefined })
          }
          className="h-8 rounded-sm border border-input bg-background px-2 font-mono text-xs text-foreground normal-case"
        >
          <option value="">any</option>
          {EXECUTION_MODES.values.map((m) => (
            <option key={m} value={m}>
              {m.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
