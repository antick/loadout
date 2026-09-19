import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

function BackupRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.backup")} />;
}

export const Route = createFileRoute("/backup")({ component: BackupRoute });
