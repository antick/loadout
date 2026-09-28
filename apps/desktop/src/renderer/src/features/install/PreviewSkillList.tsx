import {
  type InstallOutcome,
  type InstallOutcomeKind,
  PREVIEW_COLLAPSE_MIN_SKILLS,
  PREVIEW_SEARCH_MIN_SKILLS,
  type PreviewGroup,
  type RepoSkillPreview,
  filterPreviewRows,
  groupPreviewRows,
  groupState,
  showsGroups,
} from "@loadout/shared";
import { ChevronRight, Folder } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OutcomeBadge, PreviewRow } from "@/features/install/PreviewRow";
import { cn } from "@/lib/utils";

const OUTCOME_ORDER: readonly InstallOutcomeKind[] = ["new", "installed", "taken", "repeated"];

export interface PreviewSkillListProps {
  skills: readonly RepoSkillPreview[];
  checked: ReadonlySet<string>;
  names: Readonly<Record<string, string>>;
  /** Per row path: what importing it under its current name does. */
  outcomes: ReadonlyMap<string, InstallOutcome>;
  onCheckedChange: (next: Set<string>) => void;
  onRename: (relPath: string, name: string) => void;
}

/** "3 new · 1 in the library": how the names of the source fit the library, at a glance. */
function OutcomeSummary({
  outcomes,
}: {
  outcomes: ReadonlyMap<string, InstallOutcome>;
}): ReactNode {
  const { t } = useTranslation();
  const counts = new Map<InstallOutcomeKind, number>();
  for (const { kind } of outcomes.values()) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  if (counts.size < 2 && counts.has("new")) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {OUTCOME_ORDER.filter((kind) => counts.has(kind)).map((kind) => (
        <span key={kind} className="flex items-center gap-1.5">
          <OutcomeBadge kind={kind} />
          {counts.get(kind)}
        </span>
      ))}
      <span>{t("install.git.outcomeSummaryHint")}</span>
    </div>
  );
}

function GroupHeader({
  group,
  checked,
  open,
  onToggleOpen,
  onToggleAll,
}: {
  group: PreviewGroup;
  checked: ReadonlySet<string>;
  open: boolean;
  onToggleOpen: () => void;
  onToggleAll: (tick: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const state = groupState(group.rows, checked);
  const ticked = group.rows.filter((row) => checked.has(row.relPath)).length;
  const label = group.folder || t("install.git.topFolder");
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-muted/50">
      <Checkbox
        checked={state}
        aria-label={t("install.git.selectFolder", { folder: label })}
        onCheckedChange={() => onToggleAll(state !== true)}
      />
      <button
        type="button"
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onToggleOpen}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs font-medium" title={label}>
          {label}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
          {t("install.git.folderCount", { ticked, count: group.rows.length })}
        </span>
      </button>
    </div>
  );
}

/**
 * The skills of a source, grouped by folder when they sit in several, with a search field for big
 * sources. Select all / none act on what the search shows.
 */
export function PreviewSkillList({
  skills,
  checked,
  names,
  outcomes,
  onCheckedChange,
  onRename,
}: PreviewSkillListProps): ReactNode {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const allGroups = useMemo(() => groupPreviewRows(skills), [skills]);
  const grouped = showsGroups(allGroups);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    grouped && skills.length > PREVIEW_COLLAPSE_MIN_SKILLS
      ? new Set(allGroups.map((group) => group.folder))
      : new Set(),
  );
  const shown = useMemo(() => filterPreviewRows(skills, query), [skills, query]);
  const groups = useMemo(() => groupPreviewRows(shown), [shown]);
  const searching = query.trim() !== "";
  const allShownChecked = shown.length > 0 && shown.every((row) => checked.has(row.relPath));
  const anyNotNew = [...outcomes.values()].some((outcome) => outcome.kind !== "new");

  const setTicks = (rows: readonly RepoSkillPreview[], tick: boolean): void => {
    const next = new Set(checked);
    for (const row of rows) {
      if (tick) next.add(row.relPath);
      else next.delete(row.relPath);
    }
    onCheckedChange(next);
  };

  const toggleOpen = (folder: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(folder)) next.add(folder);
      return next;
    });
  };

  const renderRow = (skill: RepoSkillPreview): ReactNode => {
    const outcome = outcomes.get(skill.relPath);
    if (!outcome) return null;
    return (
      <PreviewRow
        key={skill.relPath}
        skill={skill}
        checked={checked.has(skill.relPath)}
        name={names[skill.relPath] ?? skill.name}
        outcome={outcome}
        showNew={anyNotNew}
        onToggle={() => setTicks([skill], !checked.has(skill.relPath))}
        onRename={(name) => onRename(skill.relPath, name)}
      />
    );
  };

  return (
    <>
      <OutcomeSummary outcomes={outcomes} />
      <div className="flex items-center justify-between gap-2">
        {skills.length >= PREVIEW_SEARCH_MIN_SKILLS ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("install.git.searchPlaceholder")}
            focusHotkey={false}
            className="max-w-xs flex-1"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t("install.git.previewHint")}</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={shown.length === 0}
          onClick={() => setTicks(shown, !allShownChecked)}
        >
          {t(allShownChecked ? "selection.selectNone" : "selection.selectAll")}
        </Button>
      </div>

      <ul className="-mr-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-2">
        {shown.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground">
            {t("install.git.noMatches", { query: query.trim() })}
          </li>
        ) : grouped ? (
          groups.map((group) => {
            const open = searching || !collapsed.has(group.folder);
            return (
              <li key={group.folder} className="flex flex-col gap-2">
                <GroupHeader
                  group={group}
                  checked={checked}
                  open={open}
                  onToggleOpen={() => toggleOpen(group.folder)}
                  onToggleAll={(tick) => setTicks(group.rows, tick)}
                />
                {open ? (
                  <ul className="flex flex-col gap-2 pl-4">{group.rows.map(renderRow)}</ul>
                ) : null}
              </li>
            );
          })
        ) : (
          shown.map(renderRow)
        )}
      </ul>
    </>
  );
}
