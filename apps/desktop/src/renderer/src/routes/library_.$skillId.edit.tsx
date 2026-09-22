import type { SkillLocation } from "@loadout/shared";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SkillEditorPage } from "@/features/editor/SkillEditorPage";
import { originLink } from "@/lib/skill-location";

export interface SkillEditorSearch {
  /** File to open, relative to the skill folder. Defaults to the main document. */
  file?: string;
}

function LibrarySkillEditorRoute(): ReactNode {
  const { t } = useTranslation();
  const { skillId } = Route.useParams();
  const { file } = Route.useSearch();
  const navigate = Route.useNavigate();
  const location = useMemo<SkillLocation>(() => ({ kind: "library", skillId }), [skillId]);
  return (
    <SkillEditorPage
      location={location}
      file={file ?? null}
      onOpenFile={(path) => void navigate({ search: { file: path }, replace: true })}
      crumbs={[{ label: t("nav.library"), to: "/library" }]}
      doneLink={originLink(location)}
    />
  );
}

export const Route = createFileRoute("/library_/$skillId/edit")({
  validateSearch: (search: Record<string, unknown>): SkillEditorSearch => ({
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: LibrarySkillEditorRoute,
});
