import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

function SettingsRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.settings")} />;
}

export const Route = createFileRoute("/settings")({ component: SettingsRoute });
