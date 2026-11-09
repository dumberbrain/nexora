import { Outlet } from "@tanstack/react-router";

import { AppShell } from "@/widgets/app-shell";
import { ApprovalAlerts } from "@/widgets/approvals-inbox";

/** Root route layout (routes may not import widgets directly — FSD). */
export function RootLayout() {
  return (
    <AppShell>
      <ApprovalAlerts />
      <Outlet />
    </AppShell>
  );
}
