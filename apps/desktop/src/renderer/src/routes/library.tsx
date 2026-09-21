import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { LibraryPage } from "@/features/library/LibraryPage";
import { STATUS_FILTERS, type StatusFilter } from "@/features/library/library-filters";

export interface LibrarySearch {
  /** Id of the skill whose detail is open. */
  skill?: string;
  /** Status filter to switch to once, e.g. from the tray's "updates available" item. */
  status?: StatusFilter;
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return STATUS_FILTERS.some((status) => status === value);
}

function LibraryRoute(): ReactNode {
  const { skill, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearStatus = useCallback(
    () => void navigate({ search: (prev) => ({ ...prev, status: undefined }), replace: true }),
    [navigate],
  );
  return (
    <LibraryPage
      openSkillId={skill ?? null}
      onOpenSkill={(skillId) =>
        void navigate({ search: (prev) => ({ ...prev, skill: skillId ?? undefined }) })
      }
      requestedStatus={status ?? null}
      onStatusApplied={clearStatus}
    />
  );
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    skill: typeof search.skill === "string" && search.skill ? search.skill : undefined,
    status: isStatusFilter(search.status) ? search.status : undefined,
  }),
  component: LibraryRoute,
});
