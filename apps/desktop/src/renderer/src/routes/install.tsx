import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { INSTALL_TABS, type InstallTab } from "@/lib/constants";

export interface InstallSearch {
  tab?: InstallTab;
}

function InstallRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.install")} />;
}

export const Route = createFileRoute("/install")({
  validateSearch: (search: Record<string, unknown>): InstallSearch => ({
    tab: INSTALL_TABS.find((tab) => tab === search.tab),
  }),
  component: InstallRoute,
});
