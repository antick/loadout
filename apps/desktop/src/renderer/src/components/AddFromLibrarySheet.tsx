import {
  type AgentInfo,
  type ProjectTarget,
  SOURCE_TYPES,
  type Skill,
  matchesSkillQuery,
} from "@loadout/shared";
import { Library } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AgentPicker,
  type AgentTargetChip,
  chosenAgentKeys,
  initialChipKeys,
  projectTargetChips,
} from "@/components/AgentPicker";
import { EmptyState } from "@/components/EmptyState";
import { SearchInput } from "@/components/SearchInput";
import { SourceBadge } from "@/components/SourceBadge";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { TagFilterBar } from "@/components/TagFilterBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeletons } from "@/components/Skeletons";
import { Spinner } from "@/components/ui/spinner";
import { useAgents } from "@/hooks/queries/agents";
import { useAllTags, useSkills } from "@/hooks/queries/skills";
import { agentColumnCoverage } from "@/features/library/matrix/matrix-state";
import { useSelection } from "@/hooks/use-selection";
import { matchesTagFilter } from "@/lib/tag-filter";
import { cn } from "@/lib/utils";

type AddFromLibraryTarget =
  /** No agents involved (e.g. adding to a preset): the target row is hidden. */
  | { kind: "none" }
  | { kind: "agent"; agentKey: string }
  | {
      kind: "project";
      projectId: string;
      /** Available project targets, already in priority order. */
      targets: readonly ProjectTarget[];
      /** Agent keys ticked when the sheet opens; defaults to every target. */
      initialAgentKeys?: readonly string[];
    };

/** `installed` and `unavailable` rows cannot be picked; `conflict` rows can, with a warning. */
type PickerRowState = "available" | "installed" | "conflict" | "unavailable";

export interface PickerRowInfo {
  state: PickerRowState;
  /** Short reason shown under the name, e.g. what it conflicts with. */
  hint?: string;
}

export interface AddFromLibrarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AddFromLibraryTarget;
  title?: string;
  description?: string;
  /** Per-row state for the currently ticked agents. Agent targets default to "is it deployed". */
  rowState?: (skill: Skill, agentKeys: readonly string[]) => PickerRowInfo;
  /** Leave these skills out of the list entirely, e.g. the ones a preset already holds. */
  exclude?: (skill: Skill) => boolean;
  /** Button text for N picked skills. */
  ctaLabel?: (count: number) => string;
  /** Extra control at the left of the footer, given the agent keys ticked right now. */
  renderFooterStart?: (agentKeys: readonly string[]) => ReactNode;
  /** Do the work. The sheet closes when the promise resolves and stays open when it rejects. */
  onSubmit: (skillIds: string[], agentKeys: string[]) => Promise<unknown>;
  /** Skills ticked when the sheet opens (those that can be picked). */
  initialSelectedIds?: readonly string[];
  /** A note per skill id, e.g. why it is suggested: those skills are listed first, with it. */
  featured?: ReadonlyMap<string, string>;
}

const SOURCE_FILTER_ALL = "all";
const SKELETON_ROWS = 5;
const STATE_TONES: Record<Exclude<PickerRowState, "available">, StatusTone> = {
  installed: "success",
  conflict: "warning",
  unavailable: "neutral",
};

const isPickable = (info: PickerRowInfo): boolean =>
  info.state === "available" || info.state === "conflict";

const pickableIdsOf = (rows: readonly { skill: Skill; info: PickerRowInfo }[]): string[] =>
  rows.filter(({ info }) => isPickable(info)).map(({ skill }) => skill.id);

/** Pick library skills to add to an agent or a project: search, filters, target chips, range select. */
export function AddFromLibrarySheet({
  open,
  onOpenChange,
  target,
  title,
  description,
  rowState,
  exclude,
  ctaLabel,
  renderFooterStart,
  onSubmit,
  initialSelectedIds,
  featured,
}: AddFromLibrarySheetProps): ReactNode {
  const { t } = useTranslation();
  const skills = useSkills();
  const allTags = useAllTags();
  const agents = useAgents();
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [source, setSource] = useState<string>(SOURCE_FILTER_ALL);
  const [chipKeys, setChipKeys] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const chips = useMemo<AgentTargetChip[]>(() => {
    if (target.kind === "none") return [];
    if (target.kind === "project") return projectTargetChips(target.targets);
    const agent: AgentInfo | undefined = agents.data?.find(
      (entry) => entry.key === target.agentKey,
    );
    return [
      {
        key: target.agentKey,
        label: agent?.displayName ?? target.agentKey,
        agentKeys: [target.agentKey],
      },
    ];
  }, [target, agents.data]);

  const agentKeys = useMemo(() => chosenAgentKeys(chips, chipKeys), [chips, chipKeys]);

  // For an agent: how many skills of each tag it already has, so the gaps show at a glance.
  const coverage = useMemo(() => {
    if (target.kind !== "agent") return null;
    const byTag = new Map<string, { deployed: number; total: number }>();
    const listed = (skills.data ?? []).filter((skill) => !exclude?.(skill));
    for (const tag of allTags.data ?? []) {
      const tagged = listed.filter((skill) => skill.tags.includes(tag));
      const counts = agentColumnCoverage(tagged, target.agentKey);
      if (counts.total > 0) byTag.set(tag, counts);
    }
    return byTag;
  }, [target, skills.data, allTags.data, exclude]);
  const agentLabel = chips[0]?.label ?? "";

  const infoFor = useMemo(() => {
    const fallback = (skill: Skill, keysNow: readonly string[]): PickerRowInfo => {
      const has = (key: string): boolean => skill.deployments.some((d) => d.agentKey === key);
      if (keysNow.length > 0 && keysNow.every(has)) return { state: "installed" };
      // A blocked skill cannot be installed for that agent, so it cannot be picked either.
      const blocked = keysNow.some((key) => skill.blockedAgents.includes(key) && !has(key));
      return blocked ? { state: "unavailable", hint: t("picker.blocked") } : { state: "available" };
    };
    return rowState ?? fallback;
  }, [rowState, t]);

  // Every row the targets allow, before search and filters: ticks belong to these, so narrowing
  // the list to find another skill never drops the ones ticked already.
  const allRows = useMemo(
    () =>
      (skills.data ?? [])
        .filter((skill) => !exclude?.(skill))
        .map((skill) => ({ skill, info: infoFor(skill, agentKeys), note: featured?.get(skill.id) }))
        // Featured skills first; the sort is stable, so each group keeps the library order.
        .sort((a, b) => Number(b.note !== undefined) - Number(a.note !== undefined)),
    [skills.data, exclude, infoFor, agentKeys, featured],
  );
  const rows = useMemo(
    () =>
      allRows.filter(
        ({ skill }) =>
          matchesSkillQuery(skill, query) &&
          matchesTagFilter(skill.tags, tagFilter) &&
          (source === SOURCE_FILTER_ALL || skill.sourceType === source),
      ),
    [allRows, query, tagFilter, source],
  );

  const allPickableIds = useMemo(() => pickableIdsOf(allRows), [allRows]);
  // The shown ones only drive shift-ranges and Select all.
  const pickableIds = useMemo(() => pickableIdsOf(rows), [rows]);
  const selection = useSelection(pickableIds, { keepIds: allPickableIds });
  const { exit, select } = selection;
  // Ticked once the rows for this opening's targets are known (the render after opening), and
  // once a tag chip narrows the list to skills the agent is still missing.
  const [pendingSelect, setPendingSelect] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!pendingSelect || allPickableIds.length === 0) return;
    select(pendingSelect);
    setPendingSelect(null);
  }, [pendingSelect, allPickableIds, select]);

  // Every opening starts clean, with the caller's preferred targets ticked.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTagFilter([]);
    setSource(SOURCE_FILTER_ALL);
    exit();
    setPendingSelect(
      initialSelectedIds && initialSelectedIds.length > 0 ? initialSelectedIds : null,
    );
    setChipKeys(
      initialChipKeys(chips, target.kind === "project" ? target.initialAgentKeys : undefined),
    );
    // Only re-run when the sheet opens; chips are stable for one opening.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** A tag switched on for an agent ticks the skills of that tag the agent is missing. */
  const changeTagFilter = (next: string[]): void => {
    setTagFilter(next);
    if (!coverage) return;
    const added = next.filter((tag) => !tagFilter.includes(tag));
    if (added.length === 0) return;
    const missing = (skills.data ?? [])
      .filter((skill) => added.some((tag) => skill.tags.includes(tag)))
      .filter((skill) => isPickable(infoFor(skill, agentKeys)))
      .map((skill) => skill.id);
    setPendingSelect([...selection.selectedIds, ...missing]);
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onSubmit(selection.selectedIds, agentKeys);
      onOpenChange(false);
    } catch {
      // The caller toasts the failure; keep the sheet open so the selection is not lost.
    } finally {
      setSubmitting(false);
    }
  };

  const count = selection.count;
  const needsAgents = target.kind !== "none";
  const cta = ctaLabel
    ? ctaLabel(count)
    : count === 0
      ? t("picker.addNone")
      : t("picker.add", { count });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title ?? t("picker.title")}</SheetTitle>
          <SheetDescription>{description ?? t("picker.description")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 border-b px-4 pb-3">
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              focusHotkey={false}
              focusOnMount
              className="w-auto flex-1"
              placeholder={t("picker.search")}
            />
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger size="sm" className="w-36" aria-label={t("picker.sourceFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SOURCE_FILTER_ALL}>{t("picker.allSources")}</SelectItem>
                {SOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`source.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TagFilterBar
            tags={allTags.data ?? []}
            value={tagFilter}
            onChange={changeTagFilter}
            countOf={(tag) => {
              const counts = coverage?.get(tag);
              return counts ? `${counts.deployed}/${counts.total}` : undefined;
            }}
            titleOf={(tag) => {
              const counts = coverage?.get(tag);
              if (!counts) return undefined;
              const rest = counts.total - counts.deployed;
              return rest === 0
                ? t("picker.tagAllOn", { tag, agent: agentLabel })
                : t("picker.tagSelectRest", { count: rest, tag, agent: agentLabel });
            }}
          />
          <AgentPicker
            layout="chips"
            label={t("picker.targets")}
            items={chips}
            selected={chipKeys}
            onChange={setChipKeys}
            locked={target.kind === "agent"}
            className={cn(!needsAgents && "hidden")}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{t("picker.shiftHint")}</span>
          <Button
            variant="ghost"
            size="xs"
            disabled={pickableIds.length === 0}
            onClick={selection.allSelected ? selection.deselectAll : selection.selectAll}
          >
            {selection.allSelected ? t("selection.selectNone") : t("selection.selectAll")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {skills.isPending ? (
            <div className="flex flex-col gap-1 px-2">
              <Skeletons count={SKELETON_ROWS} className="h-11 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Library}
              title={t("picker.emptyTitle")}
              description={t("picker.emptyDescription")}
            />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {rows.map(({ skill, info, note }) => {
                const pickable = isPickable(info);
                const checked = selection.isSelected(skill.id);
                return (
                  <li key={skill.id}>
                    <div
                      onClick={(event) =>
                        pickable
                          ? selection.toggle(skill.id, { shiftKey: event.shiftKey })
                          : undefined
                      }
                      role="presentation"
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors",
                        pickable ? "cursor-pointer hover:bg-accent/60" : "opacity-60",
                        checked && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!pickable}
                        aria-label={t("selection.selectItem", { name: skill.name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          selection.toggle(skill.id, { shiftKey: event.shiftKey });
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{skill.name}</span>
                        {note && !info.hint ? (
                          <span className="block truncate text-xs text-primary">{note}</span>
                        ) : (
                          <span className="block truncate text-xs text-muted-foreground">
                            {info.hint ?? skill.description ?? t("skills.noDescription")}
                          </span>
                        )}
                      </span>
                      {info.state === "available" ? (
                        <SourceBadge skill={skill} compact />
                      ) : (
                        <StatusBadge
                          tone={STATE_TONES[info.state]}
                          label={t(`picker.state.${info.state}`)}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-end border-t">
          {renderFooterStart ? (
            <div className="mr-auto min-w-0">{renderFooterStart(agentKeys)}</div>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={count === 0 || (needsAgents && agentKeys.length === 0) || submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Spinner /> : null}
            {cta}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
