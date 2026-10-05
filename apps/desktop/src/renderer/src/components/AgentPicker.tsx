import type { ProjectTarget } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Skeletons } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "@/lib/styles";

const SKELETON_ROWS = 3;

/** One agent folder that can be ticked; merged agents sharing a folder are one chip. */
export interface AgentTargetChip {
  key: string;
  label: string;
  agentKeys: readonly string[];
  /** Shown at the end of a list row, e.g. how many of the skills the agent still lacks. */
  note?: string;
}

export function projectTargetChips(targets: readonly ProjectTarget[]): AgentTargetChip[] {
  return targets.map((target) => ({
    key: target.key,
    label: target.displayName,
    agentKeys: target.agentKeys,
  }));
}

/** The chips to tick at first: those holding a preferred agent, or all of them without a preference. */
export function initialChipKeys(
  chips: readonly AgentTargetChip[],
  preferredAgentKeys?: readonly string[],
): Set<string> {
  const preferred = preferredAgentKeys ? new Set(preferredAgentKeys) : null;
  return new Set(
    chips
      .filter((chip) => !preferred || chip.agentKeys.some((key) => preferred.has(key)))
      .map((chip) => chip.key),
  );
}

/** The agent keys behind the ticked chips. */
export function chosenAgentKeys(
  chips: readonly AgentTargetChip[],
  selected: ReadonlySet<string>,
): string[] {
  return chips.filter((chip) => selected.has(chip.key)).flatMap((chip) => chip.agentKeys);
}

export interface AgentPickerProps {
  /** `chips`: a row of pills; `list`: a scrolling checklist with a note per agent. */
  layout: "chips" | "list";
  label: string;
  items: readonly AgentTargetChip[];
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  /** Shown but not changeable, e.g. the one agent a sheet was opened for. */
  locked?: boolean;
  /** The list is still loading: placeholder rows instead. */
  loading?: boolean;
  /** The list's text when there is no agent to pick. */
  emptyText?: string;
  className?: string;
  /** Sizes the scrolling list. */
  listClassName?: string;
}

/** Agents to tick, as chips or as a list, with select all and none when there is a choice. */
export function AgentPicker({
  layout,
  label,
  items,
  selected,
  onChange,
  locked = false,
  loading = false,
  emptyText,
  className,
  listClassName,
}: AgentPickerProps): ReactNode {
  const { t } = useTranslation();
  const toggle = (key: string): void => {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    onChange(next);
  };
  const selectAll = (): void => onChange(new Set(items.map((item) => item.key)));
  const selectNone = (): void => onChange(new Set());

  if (layout === "chips") {
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <span className={cn(SECTION_LABEL, "mr-1")}>{label}</span>
        {items.map((chip) => {
          const on = selected.has(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={on}
              disabled={locked}
              onClick={() => toggle(chip.key)}
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
        {!locked && items.length > 1 ? (
          <>
            <Button type="button" variant="ghost" size="xs" onClick={selectAll}>
              {t("selection.selectAll")}
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={selectNone}>
              {t("common.clear")}
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  const allChosen = items.length > 0 && items.every((item) => selected.has(item.key));
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <p className={SECTION_LABEL}>{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={items.length === 0 || locked}
          onClick={allChosen ? selectNone : selectAll}
        >
          {t(allChosen ? "selection.selectNone" : "selection.selectAll")}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-1">
          <Skeletons count={SKELETON_ROWS} className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className={cn("-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1", listClassName)}>
          {items.map((item) => {
            const checked = selected.has(item.key);
            return (
              <li key={item.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                    checked && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={() => toggle(item.key)}
                  />
                  <AgentAvatar
                    agentKey={item.agentKeys[0] ?? item.key}
                    name={item.label}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                  {item.note ? (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {item.note}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
