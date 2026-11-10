import { zodResolver } from "@hookform/resolvers/zod";
import { AGENT_TEAMS_ENABLE_CONFIRMATION } from "@ubuliera/contracts";
import { UsersIcon } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { type Execution } from "@/entities/execution";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import {
  AGENT_TEAMS_SETTINGS_FILE,
  AGENT_TEAMS_SETTINGS_SNIPPET,
  EnableAgentTeamsFormSchema,
  type EnableAgentTeamsFormInput,
  type EnableAgentTeamsFormValues,
} from "../../model/enable-agent-teams.schema";
import { useEnableAgentTeams } from "../../model/use-enable-agent-teams";

/**
 * FR-011: Agent Teams stay disabled until the project opts in. Shows the exact setting, and
 * writes it for the execution's project only after the confirmation phrase is typed.
 */
export function EnableAgentTeams({ execution }: { execution: Execution }) {
  const id = useId();
  const enable = useEnableAgentTeams(execution.id, execution.projectId);
  const form = useForm<EnableAgentTeamsFormInput, unknown, EnableAgentTeamsFormValues>({
    resolver: zodResolver(EnableAgentTeamsFormSchema),
    defaultValues: { confirmation: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const error = errors.confirmation?.message ?? errors.root?.server?.message;

  const submit = async () => {
    try {
      await enable.mutateAsync();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Enabling Agent Teams failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border border-dashed border-border bg-card p-3"
    >
      <h3 id={`${id}-title`} className="flex items-center gap-2 font-mono text-xs uppercase">
        <UsersIcon aria-hidden="true" className="size-3.5 text-phosphor" />
        Enable Agent Teams
      </h3>
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <p>
          Agent Teams are an experimental Claude Code feature, off until the project opts in. To
          enable them, add this to{" "}
          <code className="text-foreground">{AGENT_TEAMS_SETTINGS_FILE}</code> in the project root
          (or let Ubuliera write it):
        </p>
        <pre className="overflow-x-auto border border-border bg-terminal p-2 font-mono text-[11px] text-phosphor">
          {AGENT_TEAMS_SETTINGS_SNIPPET}
        </pre>
        <p>
          Teams run on the installed Claude Code&apos;s native feature — Ubuliera never simulates a
          team with subagents.
        </p>
      </div>
      {enable.data ? (
        <p role="status" className="font-mono text-xs text-phosphor">
          {enable.data.changed
            ? `Agent Teams enabled — written to ${enable.data.settingsPath}`
            : `Agent Teams were already enabled in ${enable.data.settingsPath}`}
        </p>
      ) : (
        <form
          noValidate
          aria-label="Enable Agent Teams for this project"
          onSubmit={(e) => void form.handleSubmit(submit)(e)}
          className="flex flex-col gap-2"
        >
          <label htmlFor={`${id}-phrase`} className="font-mono text-xs">
            Type <span className="text-status-paused">{AGENT_TEAMS_ENABLE_CONFIRMATION}</span> to
            confirm
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <Input
              id={`${id}-phrase`}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="max-w-xs rounded-sm font-mono"
              {...form.register("confirmation")}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={isSubmitting}
              className="rounded-sm"
            >
              Enable for this project
            </Button>
          </div>
          {error ? (
            <p id={`${id}-error`} role="alert" className="font-mono text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
