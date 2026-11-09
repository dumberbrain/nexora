import { useId } from "react";

import { type GithubStatus } from "@/entities/github";
import { humanize } from "@/shared/lib/humanize";

import { Tag } from "./tag";

const TONE: Record<GithubStatus["status"], string> = {
  connected: "border-phosphor/60 text-phosphor",
  not_installed: "border-destructive/60 text-destructive",
  not_authenticated: "border-status-paused/60 text-status-paused",
};

/** gh CLI state: connected / not installed / not signed in, plus version and account. */
export function StatusCard({ status }: { status: GithubStatus }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border p-3"
    >
      <h2 id={id} className="text-base text-foreground">
        GitHub status
      </h2>
      <Tag className={TONE[status.status]}>{humanize(status.status)}</Tag>
      {status.account ? (
        <p className="font-mono text-xs text-muted-foreground">
          account <span className="text-foreground">{status.account}</span>
        </p>
      ) : null}
      {status.version ? (
        <p className="font-mono text-xs text-muted-foreground">gh {status.version}</p>
      ) : null}
    </section>
  );
}
