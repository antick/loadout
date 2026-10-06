import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { LibraryPage } from "@/features/library/LibraryPage";
import { STATUS_FILTERS, type StatusFilter } from "@/features/library/library-filters";

export interface LibrarySearch {
  /** Id of the skill whose detail is open. */
  skill?: string;
  /** Status filter to switch to once, e.g. from the tray's "updates available" item. */
  status?: StatusFilter;
  /** Search text to switch to once, e.g. a source's address from the Sources page. */
  q?: string;
  /** Switch to favourites only once, e.g. from the sidebar. */
  favorites?: boolean;
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return STATUS_FILTERS.some((status) => status === value);
}

function LibraryRoute(): ReactNode {
  const { skill, status, q, favorites } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearRequest = useCallback(
    () =>
      void navigate({
        search: (prev) => ({ ...prev, status: undefined, q: undefined, favorites: undefined }),
        replace: true,
      }),
    [navigate],
  );
  // Stable, so the memoised cards do not all draw again when a panel opens or closes.
  const openSkill = useCallback(
    (skillId: string | null) =>
      void navigate({ search: (prev) => ({ ...prev, skill: skillId ?? undefined }) }),
    [navigate],
  );
  return (
    <LibraryPage
      openSkillId={skill ?? null}
      onOpenSkill={openSkill}
      requestedStatus={status ?? null}
      requestedQuery={q ?? null}
      requestedFavorites={favorites === true}
      onRequestApplied={clearRequest}
    />
  );
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    skill: typeof search.skill === "string" && search.skill ? search.skill : undefined,
    status: isStatusFilter(search.status) ? search.status : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    favorites: search.favorites === true || search.favorites === "true" ? true : undefined,
  }),
  component: LibraryRoute,
});
