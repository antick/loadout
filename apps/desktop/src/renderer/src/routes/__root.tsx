import { useQueryClient } from "@tanstack/react-query";
import { createRootRoute, Outlet, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SyncFlowProvider } from "@/features/backup/SyncFlowProvider";
import { subscribeAppEvents } from "@/lib/events";

function RootLayout(): ReactNode {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(
    () => subscribeAppEvents(queryClient, (to) => router.history.push(to)),
    [queryClient, router],
  );

  return (
    <SyncFlowProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </SyncFlowProvider>
  );
}

export const Route = createRootRoute({ component: RootLayout });
