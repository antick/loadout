import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LibraryPage } from "@/features/library/LibraryPage";

export interface LibrarySearch {
  /** Id of the skill whose detail is open. */
  skill?: string;
}

function LibraryRoute(): ReactNode {
  const { skill } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LibraryPage
      openSkillId={skill ?? null}
      onOpenSkill={(skillId) => void navigate({ search: { skill: skillId ?? undefined } })}
    />
  );
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    skill: typeof search.skill === "string" && search.skill ? search.skill : undefined,
  }),
  component: LibraryRoute,
});
