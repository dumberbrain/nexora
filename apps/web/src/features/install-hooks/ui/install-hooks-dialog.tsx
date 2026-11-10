import { useQuery } from "@tanstack/react-query";
import { PlugIcon } from "lucide-react";
import { useState } from "react";

import { hookPreviewQuery, type Project } from "@/entities/project";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { HookActions } from "./components/hook-actions";
import { HookPreviewBody } from "./components/hook-preview-body";

interface InstallHooksDialogProps {
  project: Pick<Project, "id" | "name" | "hooksInstalled">;
}

/**
 * FR-041: show the exact settings change first; install only on an explicit confirm click.
 * The preview is fetched fresh every time the dialog opens.
 */
export function InstallHooksDialog({ project }: InstallHooksDialogProps) {
  const [open, setOpen] = useState(false);
  const preview = useQuery({ ...hookPreviewQuery(project.id), enabled: open });
  const triggerLabel = project.hooksInstalled ? "Manage hooks" : "Install hooks";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className="rounded-sm"
          aria-label={`${triggerLabel} for ${project.name}`}
        >
          <PlugIcon aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col rounded-sm sm:max-w-2xl">
        <DialogHeader>
          <span className="text-index" aria-hidden="true">
            [hooks]
          </span>
          <DialogTitle className="text-display text-lg">
            Claude Code hooks · {project.name}
          </DialogTitle>
          <DialogDescription>
            Ubuliera observes sessions through Claude Code http hooks. Review the change to the
            project settings below — nothing is written until you confirm.
          </DialogDescription>
        </DialogHeader>
        {preview.isPending ? <LoadingState label="Loading settings preview" rows={4} /> : null}
        {preview.isError ? (
          <ErrorState
            title="Could not build the preview"
            error={preview.error}
            onRetry={() => void preview.refetch()}
          />
        ) : null}
        {preview.data ? <HookPreviewBody preview={preview.data} /> : null}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="rounded-sm">
              Cancel
            </Button>
          </DialogClose>
          <HookActions
            projectId={project.id}
            projectName={project.name}
            preview={preview.data ?? null}
            onDone={() => setOpen(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
