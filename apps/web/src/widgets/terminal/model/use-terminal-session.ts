import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";

import { connectTerminalSocket, createTerminalSocket } from "../api/terminal-socket";
import { RELEASE_FOCUS_KEY, TERMINAL_OPTIONS, terminalSize } from "../lib/terminal-config";

export type TerminalPhase = "connecting" | "attached" | "failed" | "exited";
export type TerminalState = { phase: TerminalPhase; error: string | null; exitCode: number | null };

const INITIAL: TerminalState = { phase: "connecting", error: null, exitCode: null };

/**
 * Binds an xterm instance in `container` to the lead's PTY over the /terminal namespace
 * (attach with backlog, input, resize, output, exit). useEffect is the right tool here: xterm and
 * the socket are external systems with their own lifecycles. `onReleaseFocus` runs on F6.
 */
export function useTerminalSession(
  sessionId: string,
  container: RefObject<HTMLDivElement | null>,
  onReleaseFocus: () => void,
) {
  const [state, setState] = useState<TerminalState>(INITIAL);
  const termRef = useRef<Terminal | null>(null);
  const releaseFocus = useEffectEvent(onReleaseFocus);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const term = new Terminal(TERMINAL_OPTIONS);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const refit = () => {
      try {
        fit.fit();
      } catch {
        // not laid out yet (hidden sheet) — the next resize fits it
      }
    };
    refit();
    term.attachCustomKeyEventHandler((e) => {
      if (e.key !== RELEASE_FOCUS_KEY) return true;
      if (e.type === "keydown") releaseFocus();
      return false;
    });

    const socket = createTerminalSocket();
    const size = () => terminalSize(sessionId, term.cols, term.rows);
    const attach = () =>
      socket.emit("terminal:attach", size(), (ack) => {
        if (!ack.ok) {
          setState({ phase: "failed", error: ack.error ?? "attach refused", exitCode: null });
          return;
        }
        term.reset(); // a re-attach replays the backlog — never duplicate the screen
        if (ack.backlog) term.write(ack.backlog);
        setState({ phase: "attached", error: null, exitCode: null });
      });
    const onOutput = (o: { sessionId: string; data: string }) => {
      if (o.sessionId === sessionId) term.write(o.data);
    };
    const onExit = (x: { sessionId: string; exitCode: number | null }) => {
      if (x.sessionId === sessionId)
        setState({ phase: "exited", error: null, exitCode: x.exitCode });
    };
    const onConnectError = (err: Error) =>
      setState({ phase: "failed", error: err.message, exitCode: null });

    socket.on("connect", attach);
    socket.on("connect_error", onConnectError);
    socket.on("terminal:output", onOutput);
    socket.on("terminal:exit", onExit);
    const input = term.onData((data) => socket.emit("terminal:input", { sessionId, data }));
    const resize = term.onResize(() => socket.emit("terminal:resize", size()));
    const observer = new ResizeObserver(refit);
    observer.observe(el);
    termRef.current = term;
    void connectTerminalSocket(socket);

    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.off("connect", attach);
      socket.off("connect_error", onConnectError);
      socket.off("terminal:output", onOutput);
      socket.off("terminal:exit", onExit);
      socket.disconnect();
      term.dispose();
      termRef.current = null;
      setState(INITIAL);
    };
  }, [sessionId, container]);

  return { state, focus: () => termRef.current?.focus() };
}
