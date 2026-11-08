import { Outlet } from "@tanstack/react-router";

import { AppShell } from "@/widgets/app-shell";

/** Root route layout (routes may not import widgets directly — FSD). */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
