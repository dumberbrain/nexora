import { TriangleAlertIcon } from "lucide-react";

import { mcpClientCommand, type CreateApiTokenResult } from "@/entities/api-token";
import { Button } from "@/shared/ui/button";
import { CopyValue } from "@/shared/ui/copy-value";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

interface TokenSecretDialogProps {
  /** the one-time create result; null = closed */
  created: CreateApiTokenResult | null;
  mcpEndpoint: string;
  /** forget the secret — it can never be shown again */
  onDone: () => void;
}

/** Shows a new token's secret exactly once, with a ready-to-paste `claude mcp add` command. */
export function TokenSecretDialog({ created, mcpEndpoint, onDone }: TokenSecretDialogProps) {
  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onDone()}>
      {created ? (
        <DialogContent
          className="rounded-sm sm:max-w-xl"
          // an accidental outside click must not throw the secret away
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-display text-lg">Token created</DialogTitle>
            <DialogDescription>
              Secret of <span className="font-mono text-foreground">{created.token.name}</span>{" "}
              (scope {created.token.scope}). Nexora stores only its sha-256 hash.
            </DialogDescription>
          </DialogHeader>
          <p
            role="note"
            className="flex items-start gap-2 border border-status-waiting/60 px-3 py-2 font-mono text-xs text-status-waiting"
          >
            <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Copy it now — you will not see it again. If it is lost, revoke the token and create a
            new one.
          </p>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              Token secret
            </span>
            <CopyValue value={created.secret} copyLabel="Copy token secret" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              Connect Claude Code
            </span>
            <CopyValue
              value={mcpClientCommand(mcpEndpoint, created.secret)}
              copyLabel="Copy MCP client command"
              prompt="$"
            />
            <p className="text-xs text-muted-foreground">
              The MCP server must be enabled above for this endpoint to answer.
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" className="rounded-sm" onClick={onDone}>
              I saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
