import { type HookPreview } from "@/entities/project";

import { SettingsDiff } from "./settings-diff";

/** Where the hooks go, which events they report, and the exact file change. */
export function HookPreviewBody({ preview }: { preview: HookPreview }) {
  return (
    <div className="flex min-h-0 flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">file</dt>
        <dd className="break-all text-foreground">
          {preview.settingsPath}
          {preview.exists ? null : (
            <span className="ms-2 text-status-paused">(will be created)</span>
          )}
        </dd>
        <dt className="text-muted-foreground">events</dt>
        <dd className="text-foreground">{preview.events.join(", ")}</dd>
        <dt className="text-muted-foreground">status</dt>
        <dd className={preview.alreadyInstalled ? "text-phosphor" : "text-muted-foreground"}>
          {preview.alreadyInstalled ? "Ubuliera hooks already installed" : "not installed yet"}
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Existing settings and hooks are kept — Ubuliera only adds its own entries, and uninstall
        removes only those.
      </p>
      <SettingsDiff before={preview.before} after={preview.after} />
    </div>
  );
}
