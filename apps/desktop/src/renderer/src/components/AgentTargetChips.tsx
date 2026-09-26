import type { ProjectTarget } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One agent folder that can be ticked; merged agents sharing a folder are one chip. */
export interface AgentTargetChip {
  key: string;
  label: string;
  agentKeys: readonly string[];
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

export interface AgentTargetChipsProps {
  label: string;
  chips: readonly AgentTargetChip[];
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  /** Shown but not changeable, e.g. the one agent a sheet was opened for. */
  locked?: boolean;
  className?: string;
}

/** A row of agent chips to tick, with select all and clear when there is a choice to make. */
export function AgentTargetChips({
  label,
  chips,
  selected,
  onChange,
  locked = false,
  className,
}: AgentTargetChipsProps): ReactNode {
  const { t } = useTranslation();
  const toggle = (key: string): void => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {chips.map((chip) => {
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
      {!locked && chips.length > 1 ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(new Set(chips.map((chip) => chip.key)))}
          >
            {t("selection.selectAll")}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => onChange(new Set())}>
            {t("common.clear")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
