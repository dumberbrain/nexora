import { useId } from "react";

import { NODE_KIND_LABEL, type WorkflowNode } from "@/entities/workflow";

import { LABEL_CLASS, SELECT_CLASS } from "./field-styles";

interface NodePickerProps {
  nodes: WorkflowNode[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/** Keyboard alternative to clicking a node on the canvas. */
export function NodePicker({ nodes, value, onChange }: NodePickerProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        Selected node
      </label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">None</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label} ({NODE_KIND_LABEL[n.kind]})
          </option>
        ))}
      </select>
    </div>
  );
}
