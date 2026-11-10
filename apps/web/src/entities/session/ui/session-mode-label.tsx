import { UnavailableBadge } from "@/shared/ui/state";

import { type Session } from "../model/types";

/**
 * Execution mode column (FR-026). Observed sessions have no Ubuliera execution, so their mode is
 * literally "observed"; the Session payload does not carry a managed execution's mode yet.
 */
export function SessionModeLabel({
  session,
}: {
  session: Pick<Session, "observeOnly" | "executionId">;
}) {
  if (session.observeOnly || session.executionId === null) {
    return <span className="font-mono text-xs text-muted-foreground">observed</span>;
  }
  return <UnavailableBadge reason="execution mode is not included in the session payload" />;
}
