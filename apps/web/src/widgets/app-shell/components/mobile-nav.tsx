import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";

import { SidebarNav } from "./sidebar-nav";

/** Drawer navigation below the md breakpoint. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <MenuIcon className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-border bg-terminal p-0 pt-12">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
