import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

function DashboardRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.dashboard")} />;
}

export const Route = createFileRoute("/")({ component: DashboardRoute });
