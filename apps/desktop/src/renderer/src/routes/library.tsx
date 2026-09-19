import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export interface LibrarySearch {
  /** Id of the skill whose detail is open. */
  skill?: string;
}

function LibraryRoute(): ReactNode {
  const { t } = useTranslation();
  return <PagePlaceholder title={t("nav.library")} />;
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    skill: typeof search.skill === "string" && search.skill ? search.skill : undefined,
  }),
  component: LibraryRoute,
});
