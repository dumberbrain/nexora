import "@xterm/xterm/css/xterm.css";

import { type Session } from "@ubuliera/contracts";
import { ShieldQuestionIcon, TerminalSquareIcon } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/shared/ui/button";

import { mayAwaitWorkspaceTrust, RELEASE_FOCUS_KEY } from "../lib/terminal-config";
import { type TerminalState, useTerminalSession } from "../model/use-terminal-session";

interface TeamLeadTerminalProps {
  /** a Ubuliera-started agent_team_pty lead session */
  session: Session;
}

function phaseText({ phase, error, exitCode }: TerminalState): string {
  if (phase === "connecting") return "Connecting…";
  if (phase === "attached") return "Attached — live";
  if (phase === "exited") return `Session ended (exit code ${exitCode ?? "unknown"})`;
  return `Terminal unavailable: ${error ?? "unknown error"}`;
}

/**
 * The interactive Agent Teams lead (T141): its PTY rendered with xterm, keystrokes sent back.
 * Used for the workspace-trust answer and anything else the lead asks in its own UI.
 */
export function TeamLeadTerminal({ session }: TeamLeadTerminalProps) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const { state, focus } = useTerminalSession(session.id, container, () =>
    focusButton.current?.focus(),
  );
  const trust = mayAwaitWorkspaceTrust(session.status);

  return (
    <section
      aria-labelledby={`${id}-title`}
      data-terminal
      className="flex flex-col gap-2 border border-border bg-card p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${id}-title`} className="flex items-center gap-1.5 font-mono text-xs uppercase">
          <TerminalSquareIcon aria-hidden="true" className="size-3.5 text-phosphor" />
          Team lead terminal
        </h4>
        <Button
          ref={focusButton}
          type="button"
          size="sm"
          variant="outline"
          className="rounded-sm"
          onClick={focus}
        >
          Focus terminal
        </Button>
      </div>
      {trust ? (
        <p
          role="status"
          aria-label="Workspace trust"
          className="flex items-start gap-2 border border-status-waiting/60 bg-status-waiting/10 p-2 font-mono text-xs text-status-waiting"
        >
          <ShieldQuestionIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Claude Code may be waiting for the workspace-trust answer — answer the prompt in the
          terminal. Ubuliera never accepts it for you.
        </p>
      ) : null}
      {state.phase === "failed" ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {phaseText(state)}
        </p>
      ) : (
        <p aria-live="polite" className="font-mono text-[11px] text-muted-foreground">
          {phaseText(state)}
        </p>
      )}
      <div
        ref={container}
        aria-describedby={`${id}-hint`}
        className="h-72 overflow-hidden bg-[#07090b] p-1"
      />
      <p id={`${id}-hint`} className="font-mono text-[11px] text-muted-foreground">
        Keystrokes go straight to Claude Code (Esc too — it does not close this panel). Press{" "}
        {RELEASE_FOCUS_KEY} to move focus out of the terminal.
      </p>
    </section>
  );
}
