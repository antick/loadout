import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SkillEditorPage } from "@/features/editor/SkillEditorPage";

export interface SkillEditorSearch {
  /** File to open, relative to the skill folder. Defaults to the main document. */
  file?: string;
}

function SkillEditorRoute(): ReactNode {
  const { skillId } = Route.useParams();
  const { file } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    // Keyed so open files, drafts and dialogs never carry over to another skill.
    <SkillEditorPage
      key={skillId}
      skillId={skillId}
      file={file ?? null}
      onOpenFile={(path) => void navigate({ search: { file: path }, replace: true })}
    />
  );
}

export const Route = createFileRoute("/library_/$skillId/edit")({
  validateSearch: (search: Record<string, unknown>): SkillEditorSearch => ({
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: SkillEditorRoute,
});
