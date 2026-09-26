import { type ProjectSuggestion, formatRelative } from "@loadout/shared";
import { CircleAlert, FolderSearch, Lock, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { SearchInput } from "@/components/SearchInput";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAppInfo } from "@/hooks/queries/app";
import { useProjectSuggestions } from "@/hooks/queries/projects";
import { compactHome } from "@/lib/paths";
import { errorMessage } from "@/lib/toast";
import type { AddProjectTabProps } from "./AddProjectFolderTab";
import {
  AddProjectsFooter,
  AddProjectsOutcome,
  ProjectPickList,
  useAddPickedProjects,
} from "./ProjectPickList";

const SUGGESTED_ITEM_ID_PREFIX = "suggested-project-";
const SKELETON_ROWS = [0, 1, 2, 3];
/** Taller than the Scan list: each row here has two lines. */
const LIST_CLASS = "max-h-72 overflow-y-auto rounded-lg border";

function matches(suggestion: ProjectSuggestion, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    !needle ||
    suggestion.name.toLowerCase().includes(needle) ||
    suggestion.path.toLowerCase().includes(needle)
  );
}

/** Name and when it was last worked on, the folder, and where it was seen. */
function SuggestionRow({
  suggestion,
  homeDir,
}: {
  suggestion: ProjectSuggestion;
  homeDir: string | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const path = compactHome(suggestion.path, homeDir);
  return (
    <div className="flex min-w-0 flex-col gap-1 py-0.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-medium">{suggestion.name}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatRelative(suggestion.lastActiveAt)}
        </span>
      </div>
      <span className="truncate font-mono text-xs text-muted-foreground" title={suggestion.path}>
        {path}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {suggestion.sources.map((source) => (
          <StatusBadge
            key={source}
            tone="neutral"
            label={t(`addProject.suggested.sources.${source}`)}
          />
        ))}
        {suggestion.skillFolders.map((folder) => (
          <StatusBadge key={folder} tone="primary" label={folder} className="font-mono" />
        ))}
        {suggestion.guarded ? (
          <span title={t("addProject.suggested.guardedHint")}>
            <StatusBadge tone="warning" icon={<Lock />} label={t("addProject.suggested.guarded")} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Projects the user already works in (agent and editor history, Git repositories), ready to tick
 * and link. Nothing starts ticked: these are guesses, not a search the user ran.
 */
export function AddProjectSuggestedTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const suggestions = useProjectSuggestions();
  const addPicked = useAddPickedProjects(onAdded);
  const { data: info } = useAppInfo();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const all = useMemo(() => suggestions.data ?? [], [suggestions.data]);
  const shown = useMemo(() => all.filter((entry) => matches(entry, query)), [all, query]);
  const guarded = all.some((entry) => entry.guarded);

  let body: ReactNode;
  if (suggestions.isPending) {
    body = (
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        {SKELETON_ROWS.map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (suggestions.isError) {
    body = (
      <InlineNotice tone="danger" icon={CircleAlert}>
        {errorMessage(suggestions.error, "addProject.suggested.error")}
      </InlineNotice>
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon={FolderSearch}
        title={t("addProject.suggested.noneTitle")}
        description={t("addProject.suggested.noneBody")}
        className="border py-8"
      />
    );
  } else {
    body = (
      <>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("addProject.suggested.search")}
          focusHotkey={false}
        />
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("addProject.suggested.noMatch")}</p>
        ) : (
          <ProjectPickList
            items={shown.map((suggestion) => ({
              path: suggestion.path,
              content: <SuggestionRow suggestion={suggestion} homeDir={info?.homeDir} />,
            }))}
            picked={picked}
            onPickedChange={setPicked}
            countLabel={
              shown.length === all.length
                ? t("addProject.suggested.count", { count: all.length })
                : t("addProject.suggested.shown", { shown: shown.length, count: all.length })
            }
            idPrefix={SUGGESTED_ITEM_ID_PREFIX}
            className={LIST_CLASS}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm text-muted-foreground">{t("addProject.suggested.hint")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={suggestions.isFetching}
          onClick={() => void suggestions.refetch()}
        >
          {suggestions.isFetching ? <Spinner /> : <RefreshCw />}
          {t("addProject.suggested.refresh")}
        </Button>
      </div>

      {body}

      {guarded ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" />
          {t("addProject.suggested.guardedHint")}
        </p>
      ) : null}

      <AddProjectsOutcome outcome={addPicked.outcome} error={addPicked.error} />

      <AddProjectsFooter
        outcome={addPicked.outcome}
        pickedCount={picked.size}
        pending={addPicked.pending}
        onSubmit={() =>
          addPicked.add(all.flatMap((entry) => (picked.has(entry.path) ? [entry.path] : [])))
        }
        onCancel={onCancel}
        onAdded={onAdded}
      />
    </>
  );
}
