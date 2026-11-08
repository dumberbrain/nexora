import { type ReactNode } from "react";

import { AppHeader } from "../components/app-header";
import { SidebarNav } from "../components/sidebar-nav";

/** Page frame: header, desktop sidebar (drawer on mobile), terminal-grid main area. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppHeader />
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-terminal py-4 md:block">
          <SidebarNav />
        </aside>
        <main id="main" className="min-w-0 flex-1 bg-terminal-grid p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
