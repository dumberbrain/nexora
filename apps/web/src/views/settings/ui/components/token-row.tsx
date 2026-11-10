import { useId } from "react";

import { isRevoked, type ApiToken } from "@/entities/api-token";
import { RevokeTokenButton } from "@/features/revoke-api-token";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format-time";

const TAG =
  "inline-flex items-center border px-1.5 font-mono text-[10px] tracking-widest uppercase";

/** One API token — never its secret. Revoked tokens stay listed, greyed out. */
export function TokenRow({ token }: { token: ApiToken }) {
  const nameId = useId();
  const revoked = isRevoked(token);
  return (
    <li
      aria-labelledby={nameId}
      data-revoked={revoked}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-1 py-2 last:border-b-0",
        revoked && "opacity-50",
      )}
    >
      <span id={nameId} className={cn("font-mono text-sm", revoked && "line-through")}>
        {token.name}
      </span>
      <span
        className={cn(
          TAG,
          token.scope === "control"
            ? "border-status-waiting/60 text-status-waiting"
            : "border-border text-muted-foreground",
        )}
      >
        scope: {token.scope}
      </span>
      {revoked ? (
        <span className={cn(TAG, "border-border text-muted-foreground")}>revoked</span>
      ) : null}
      <span className="font-mono text-[11px] text-muted-foreground">
        created {formatDateTime(token.createdAt)}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {token.lastUsedAt === null ? "never used" : `last used ${formatDateTime(token.lastUsedAt)}`}
      </span>
      {revoked ? null : (
        <span className="ms-auto">
          <RevokeTokenButton token={token} />
        </span>
      )}
    </li>
  );
}
