import { SearchIcon, XIcon } from "lucide-react";
import { type FormEvent } from "react";

import { type EventFilters } from "@/entities/event";
import { fromDateTimeLocal, toDateTimeLocal } from "@/shared/lib/format-time";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import { type FilterPatch } from "../../model/filter-patch";

interface TextFiltersProps {
  filters: EventFilters;
  onApply: (patch: Pick<FilterPatch, "sessionId" | "agentId" | "q" | "from" | "to">) => void;
  onClear: () => void;
}

const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

/**
 * Free-text filters, applied on submit (Enter or the button) so typing does not refetch per key.
 * Uncontrolled inputs: the parent re-keys this form when the URL changes.
 */
export function TextFilters({ filters, onApply, onClear }: TextFiltersProps) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onApply({
      sessionId: text(fd.get("sessionId")),
      agentId: text(fd.get("agentId")),
      q: text(fd.get("q")),
      from: fromDateTimeLocal(text(fd.get("from")) ?? ""),
      to: fromDateTimeLocal(text(fd.get("to")) ?? ""),
    });
  };

  return (
    <form
      role="search"
      aria-label="Log filters"
      onSubmit={submit}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
    >
      <TextField
        label="Search text"
        name="q"
        defaultValue={filters.q ?? ""}
        placeholder="summary contains…"
        maxLength={200}
      />
      <TextField
        label="Session id"
        name="sessionId"
        defaultValue={filters.sessionId ?? ""}
        spellCheck={false}
      />
      <TextField
        label="Agent id"
        name="agentId"
        defaultValue={filters.agentId ?? ""}
        spellCheck={false}
      />
      <TextField
        label="From"
        name="from"
        type="datetime-local"
        defaultValue={filters.from !== undefined ? toDateTimeLocal(filters.from) : ""}
      />
      <TextField
        label="To"
        name="to"
        type="datetime-local"
        defaultValue={filters.to !== undefined ? toDateTimeLocal(filters.to) : ""}
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="rounded-sm">
          <SearchIcon aria-hidden="true" />
          Apply
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-sm" onClick={onClear}>
          <XIcon aria-hidden="true" />
          Clear
        </Button>
      </div>
    </form>
  );
}
