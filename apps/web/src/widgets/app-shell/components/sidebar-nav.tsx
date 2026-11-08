import { Link } from "@tanstack/react-router";

import { cn } from "@/shared/lib/cn";

import { NAV_ITEMS, type NavItem } from "../model/nav-items";

const ROW = "group flex items-center gap-3 px-3 py-2 font-mono text-xs uppercase tracking-widest";

function Label({ item }: { item: NavItem }) {
  return (
    <>
      <span className="text-[10px] text-muted-foreground group-data-[status=active]:text-phosphor">
        [{item.index}]
      </span>
      <span>/{item.label}</span>
    </>
  );
}

interface SidebarNavProps {
  onNavigate?: () => void;
  className?: string;
}

/** Primary navigation. Unbuilt pages stay visible but disabled with the delivering story. */
export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-0.5", className)}>
      {NAV_ITEMS.map((item) =>
        item.to ? (
          <Link
            key={item.index}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              ROW,
              "border-l-2 border-transparent text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
              "data-[status=active]:border-phosphor data-[status=active]:bg-accent data-[status=active]:text-phosphor",
            )}
          >
            <Label item={item} />
          </Link>
        ) : (
          <span
            key={item.index}
            aria-disabled="true"
            title={`Arrives with ${item.story}`}
            className={cn(
              ROW,
              "cursor-not-allowed border-l-2 border-transparent text-muted-foreground/50",
            )}
          >
            <Label item={item} />
            <span className="ms-auto text-[9px] tracking-normal normal-case">{item.story}</span>
          </span>
        ),
      )}
    </nav>
  );
}
