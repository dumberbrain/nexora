import { useQuery } from "@tanstack/react-query";
import { CoinsIcon } from "lucide-react";
import { useId } from "react";

import { modelConsentQuery, type Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

import { useRevokeConsent } from "../model/use-revoke-consent";

interface ModelConsentStatusProps {
  project: Pick<Project, "id" | "name">;
  className?: string;
}

/**
 * FR-008: whether model-backed steps for this project run without asking ("always allow", set
 * from the consent dialog) — and a one-click revoke. Granting happens only in that dialog.
 */
export function ModelConsentStatus({ project, className }: ModelConsentStatusProps) {
  const labelId = useId();
  const consent = useQuery(modelConsentQuery(project.id));
  const revoke = useRevokeConsent(project.id);
  const allowed = consent.data?.alwaysAllow === true;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex flex-wrap items-center gap-2 font-mono text-[11px]", className)}
    >
      <span id={labelId} className="inline-flex items-center gap-1 text-muted-foreground">
        <CoinsIcon className="size-3" aria-hidden="true" />
        model usage
      </span>
      {consent.isPending ? <span className="text-muted-foreground">checking…</span> : null}
      {consent.isError ? <span className="text-destructive">consent state unavailable</span> : null}
      {consent.data ? (
        <span className={allowed ? "text-status-waiting" : "text-foreground"}>
          {allowed ? "always allowed" : "asks every time"}
        </span>
      ) : null}
      {allowed ? (
        <Button
          variant="outline"
          size="xs"
          className="rounded-sm"
          disabled={revoke.isPending}
          aria-label={`Revoke model-usage consent for ${project.name}`}
          onClick={() => revoke.mutate()}
        >
          {revoke.isPending ? "Revoking…" : "Revoke"}
        </Button>
      ) : null}
      {revoke.isError ? (
        <span role="alert" className="text-destructive">
          Revoke failed: {revoke.error.message}
        </span>
      ) : null}
    </div>
  );
}
