import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { InstallPage } from "@/features/install/InstallPage";
import { DEFAULT_INSTALL_TAB, INSTALL_TABS, type InstallTab } from "@/lib/constants";

export interface InstallSearch {
  tab?: InstallTab;
}

function InstallRoute(): ReactNode {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <InstallPage
      tab={tab ?? DEFAULT_INSTALL_TAB}
      onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })}
    />
  );
}

export const Route = createFileRoute("/install")({
  validateSearch: (search: Record<string, unknown>): InstallSearch => ({
    tab: INSTALL_TABS.find((tab) => tab === search.tab),
  }),
  component: InstallRoute,
});
