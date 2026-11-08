import { Link } from "@tanstack/react-router";

import { ThemeToggle } from "@/features/toggle-theme";

import { ConnectionIndicator } from "./connection-indicator";
import { MobileNav } from "./mobile-nav";

/** Sticky top bar: brand, realtime status, theme. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-border bg-terminal/85 px-3 backdrop-blur-lg md:px-4">
      <MobileNav />
      <Link to="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
        <span className="text-phosphor" aria-hidden="true">
          ▲
        </span>
        nexora
      </Link>
      <div className="ms-auto flex items-center gap-3">
        <ConnectionIndicator />
        <ThemeToggle />
      </div>
    </header>
  );
}
