import { type AgentInfo, type ProjectTarget, SOURCE_TYPES, type Skill } from "@loadout/shared";
import { Library } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAgents } from "@/hooks/queries/agents";
import { useAllTags, useSkills } from "@/hooks/queries/skills";
import { useSelection } from "@/hooks/use-selection";
import { matchesTagFilter } from "@/lib/tag-filter";
import { cn, matchesQuery } from "@/lib/utils";

export type AddFromLibraryTarget =
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
export type PickerRowState = "available" | "installed" | "conflict" | "unavailable";

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
}

const SOURCE_FILTER_ALL = "all";
const STATE_TONES: Record<Exclude<PickerRowState, "available">, StatusTone> = {
  installed: "success",
  conflict: "warning",
  unavailable: "neutral",
};

interface TargetChip {
  key: string;
  label: string;
  agentKeys: readonly string[];
}

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

  const chips = useMemo<TargetChip[]>(() => {
    if (target.kind === "none") return [];
    if (target.kind === "project") {
      return target.targets.map((entry) => ({
        key: entry.key,
        label: entry.displayName,
        agentKeys: entry.agentKeys,
      }));
    }
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

  const agentKeys = useMemo(
    () => chips.filter((chip) => chipKeys.has(chip.key)).flatMap((chip) => chip.agentKeys),
    [chips, chipKeys],
  );

  const infoFor = useMemo(() => {
    const fallback = (skill: Skill, keysNow: readonly string[]): PickerRowInfo => ({
      state:
        keysNow.length > 0 &&
        keysNow.every((key) => skill.deployments.some((d) => d.agentKey === key))
          ? "installed"
          : "available",
    });
    return rowState ?? fallback;
  }, [rowState]);

  const rows = useMemo(
    () =>
      (skills.data ?? [])
        .filter((skill) => !exclude?.(skill))
        .filter((skill) => matchesQuery(query, skill.name, skill.description))
        .filter((skill) => matchesTagFilter(skill.tags, tagFilter))
        .filter((skill) => source === SOURCE_FILTER_ALL || skill.sourceType === source)
        .map((skill) => ({ skill, info: infoFor(skill, agentKeys) })),
    [skills.data, exclude, query, tagFilter, source, infoFor, agentKeys],
  );

  const pickableIds = useMemo(
    () =>
      rows
        .filter(({ info }) => info.state === "available" || info.state === "conflict")
        .map(({ skill }) => skill.id),
    [rows],
  );
  const selection = useSelection(pickableIds);
  const { exit } = selection;

  // Every opening starts clean, with the caller's preferred targets ticked.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTagFilter([]);
    setSource(SOURCE_FILTER_ALL);
    exit();
    const initial =
      target.kind === "project" && target.initialAgentKeys
        ? new Set(target.initialAgentKeys)
        : null;
    setChipKeys(
      new Set(
        chips
          .filter((chip) => !initial || chip.agentKeys.some((key) => initial.has(key)))
          .map((chip) => chip.key),
      ),
    );
    // Only re-run when the sheet opens; chips are stable for one opening.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          <TagFilterBar tags={allTags.data ?? []} value={tagFilter} onChange={setTagFilter} />
          <div className={cn("flex flex-wrap items-center gap-1.5", !needsAgents && "hidden")}>
            <span className="mr-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("picker.targets")}
            </span>
            {chips.map((chip) => {
              const on = chipKeys.has(chip.key);
              const locked = target.kind === "agent";
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  onClick={() =>
                    setChipKeys((previous) => {
                      const next = new Set(previous);
                      if (on) next.delete(chip.key);
                      else next.add(chip.key);
                      return next;
                    })
                  }
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border py-0 pr-2 pl-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <AgentAvatar
                    agentKey={chip.agentKeys[0] ?? chip.key}
                    name={chip.label}
                    size="sm"
                    className="rounded-full"
                    status={on ? undefined : "off"}
                  />
                  {chip.label}
                </button>
              );
            })}
            {target.kind === "project" && chips.length > 1 ? (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setChipKeys(new Set(chips.map((chip) => chip.key)))}
                >
                  {t("selection.selectAll")}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setChipKeys(new Set())}>
                  {t("common.clear")}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{t("picker.shiftHint")}</span>
          <Button
            variant="ghost"
            size="xs"
            disabled={pickableIds.length === 0}
            onClick={selection.allSelected ? selection.clear : selection.selectAll}
          >
            {selection.allSelected ? t("selection.selectNone") : t("selection.selectAll")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {skills.isPending ? (
            <div className="flex flex-col gap-1 px-2">
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-11 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Library}
              title={t("picker.emptyTitle")}
              description={t("picker.emptyDescription")}
            />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {rows.map(({ skill, info }) => {
                const pickable = info.state === "available" || info.state === "conflict";
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
                        <span className="block truncate text-xs text-muted-foreground">
                          {info.hint ?? skill.description ?? t("skills.noDescription")}
                        </span>
                      </span>
                      {info.state === "available" ? (
                        <SourceBadge source={skill.sourceType} compact />
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
