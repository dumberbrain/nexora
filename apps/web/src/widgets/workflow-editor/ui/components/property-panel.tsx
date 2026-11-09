import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";

import { NODE_KIND_LABEL, STRUCTURAL_KINDS, type WorkflowNode } from "@/entities/workflow";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import { ConfigFields } from "./config-fields";
import { PolicyFields } from "./policy-fields";
import {
  CONFIG_FIELDS,
  propertySchema,
  toFormValues,
  type PropertyFormOutput,
  type PropertyFormValues,
} from "../../lib/property-form";

interface PropertyPanelProps {
  node: WorkflowNode;
  /** every node of the graph — `goto` targets */
  nodes: WorkflowNode[];
  readOnly: boolean;
  onApply: (id: string, patch: PropertyFormOutput) => void;
  onDelete: (id: string) => void;
}

/**
 * Properties of the selected node (RHF + zod: NODE_CONFIG_SCHEMAS + retry/onError). Key it by
 * node id so switching nodes resets the form.
 */
export function PropertyPanel({ node, nodes, readOnly, onApply, onDelete }: PropertyPanelProps) {
  const form = useForm<PropertyFormValues, unknown, PropertyFormOutput>({
    resolver: zodResolver(propertySchema(node.kind)),
    defaultValues: toFormValues(node),
  });
  const { errors, isDirty, isSubmitSuccessful } = form.formState;
  const structural = STRUCTURAL_KINDS.has(node.kind);
  const fixed = node.kind === "start" || node.kind === "end";

  const apply = (patch: PropertyFormOutput) => {
    onApply(node.id, patch);
    form.reset(form.getValues());
  };

  return (
    <form
      noValidate
      aria-label={`Properties of ${node.label}`}
      onSubmit={(e) => void form.handleSubmit(apply)(e)}
      className="flex flex-col gap-3"
    >
      <p className="font-mono text-[11px] text-muted-foreground">
        <span className="text-index">{NODE_KIND_LABEL[node.kind]}</span> · id {node.id}
      </p>
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-3">
        <legend className="sr-only">Node properties</legend>
        <TextField label="Label" error={errors.label?.message} {...form.register("label")} />
        <ConfigFields
          fields={CONFIG_FIELDS[node.kind] ?? []}
          register={form.register}
          errors={errors}
        />
        {structural ? null : (
          <PolicyFields
            register={form.register}
            control={form.control}
            errors={errors}
            targets={nodes.filter((n) => n.id !== node.id)}
          />
        )}
      </fieldset>
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" className="rounded-sm">
            <CheckIcon aria-hidden="true" />
            Apply changes
          </Button>
          {fixed ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-sm text-destructive"
              onClick={() => onDelete(node.id)}
            >
              <Trash2Icon aria-hidden="true" />
              Delete node
            </Button>
          )}
          {isSubmitSuccessful && !isDirty ? (
            <span role="status" className="font-mono text-[11px] text-status-completed">
              applied to draft
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}
