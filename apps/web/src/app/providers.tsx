import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";

import { useThemeStore } from "@/features/toggle-theme";
import { queryClient } from "@/shared/api";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";

function ThemedToaster() {
  const theme = useThemeStore((s) => s.resolved);
  return <Toaster theme={theme} position="bottom-right" />;
}

/** App-wide providers: server-state cache, tooltips, toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
