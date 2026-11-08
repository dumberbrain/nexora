import { PlugZapIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";

import { type HookPreview } from "@/entities/project";
import { Button } from "@/shared/ui/button";

import { useInstallHooks, useUninstallHooks } from "../../model/use-hook-actions";

interface HookActionsProps {
  projectId: string;
  projectName: string;
  /** null while the preview is loading/failed — install stays disabled until the diff is shown */
  preview: HookPreview | null;
  onDone: () => void;
}

/** Explicit install / uninstall buttons. Nothing is written without one of these clicks. */
export function HookActions({ projectId, projectName, preview, onDone }: HookActionsProps) {
  const install = useInstallHooks(projectId);
  const uninstall = useUninstallHooks(projectId);
  const busy = install.isPending || uninstall.isPending;

  const onInstall = () =>
    install.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Hooks installed for ${projectName}`);
        onDone();
      },
      onError: (e) => toast.error("Install failed", { description: e.message }),
    });

  const onUninstall = () =>
    uninstall.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Hooks removed from ${projectName}`);
        onDone();
      },
      onError: (e) => toast.error("Uninstall failed", { description: e.message }),
    });

  return (
    <>
      {preview?.alreadyInstalled ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-sm"
          disabled={busy}
          onClick={onUninstall}
        >
          <UnplugIcon aria-hidden="true" />
          {uninstall.isPending ? "Removing…" : "Uninstall hooks"}
        </Button>
      ) : null}
      <Button
        size="sm"
        className="rounded-sm"
        disabled={busy || preview === null}
        onClick={onInstall}
      >
        <PlugZapIcon aria-hidden="true" />
        {install.isPending
          ? "Installing…"
          : preview?.alreadyInstalled
            ? "Reinstall hooks"
            : "Confirm & install hooks"}
      </Button>
    </>
  );
}
