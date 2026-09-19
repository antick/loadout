import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TOAST_DURATION_MS } from "@/lib/constants";
import { queryClient } from "@/lib/query-client";
import "@/lib/i18n";

const TOOLTIP_DELAY_MS = 300;

/** Every app-wide provider, in dependency order. Wraps the router in `main.tsx`. */
export function AppProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
          <ConfirmProvider>{children}</ConfirmProvider>
          <Toaster position="bottom-right" duration={TOAST_DURATION_MS} closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
