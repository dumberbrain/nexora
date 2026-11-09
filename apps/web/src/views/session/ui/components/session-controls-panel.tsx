import { type Session } from "@/entities/session";
import { SessionControls } from "@/features/control-session";
import { SendMessageForm } from "@/features/send-message";

/** Stop · Interrupt & hold · Resume · Restart + a message to the main agent (US3). */
export function SessionControlsPanel({ session }: { session: Session }) {
  return (
    <section
      aria-labelledby="session-controls"
      className="flex flex-col gap-3 border border-border bg-card p-4"
    >
      <h2 id="session-controls" className="text-sm tracking-widest">
        Controls
      </h2>
      {session.observeOnly ? (
        <p className="font-mono text-xs text-muted-foreground">
          Started outside Nexora — controls stay visible but disabled; use the terminal running this
          session.
        </p>
      ) : null}
      <SessionControls session={session} />
      <SendMessageForm target={{ kind: "session", session }} className="max-w-2xl" />
    </section>
  );
}
