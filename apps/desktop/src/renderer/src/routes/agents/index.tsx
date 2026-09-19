import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

function AgentsRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.allAgents")} />;
}

export const Route = createFileRoute("/agents/")({ component: AgentsRoute });
