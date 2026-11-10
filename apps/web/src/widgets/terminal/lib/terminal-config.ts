import { type TerminalAttach } from "@ubuliera/contracts";
import { type ITerminalOptions } from "@xterm/xterm";

/** Key that moves focus out of the terminal (Claude Code does not use F6; Esc and Tab it does). */
export const RELEASE_FOCUS_KEY = "F6";

/** Phosphor palette; the lead's TUI expects a dark background in both app themes. */
export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  convertEol: false,
  fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
  fontSize: 13,
  scrollback: 5000,
  screenReaderMode: true,
  theme: {
    background: "#07090b",
    foreground: "#eeeeee",
    cursor: "#4ade80",
    selectionBackground: "#4ade8066",
    green: "#4ade80",
    brightGreen: "#86efac",
  },
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Attach/resize payload clamped to the contract bounds (cols 20–500, rows 5–200). */
export function terminalSize(sessionId: string, cols: number, rows: number): TerminalAttach {
  return { sessionId, cols: clamp(cols, 20, 500), rows: clamp(rows, 5, 200) };
}

/**
 * The PTY lead stops at Claude Code's workspace-trust dialog (default "No, exit") before any hook
 * fires, so a lead that has not reported a running state yet may be waiting for that answer;
 * Ubuliera never answers it (research.md "S2 result").
 */
export function mayAwaitWorkspaceTrust(status: string): boolean {
  return status === "starting" || status === "waiting_for_approval";
}
