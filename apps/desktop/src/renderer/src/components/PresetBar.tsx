import type { Preset, Skill } from "@loadout/shared";
import { Check } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetIcon } from "@/components/PresetIcon";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computePresetState, type PresetBarMode, type SkillAgentPair } from "@/lib/preset-state";
import { cn } from "@/lib/utils";

export interface PresetBarProps {
  presets: readonly Preset[];
  /** Library skills; preset members that no longer exist are ignored. */
  skills: readonly Skill[];
  /** Agents of this scope: one agent, every available agent, or a project's targets. */
  agentKeys: readonly string[];
  /** Is this skill present for this agent in the scope? */
  exists: (skillId: string, agentKey: string) => boolean;
  /** `agent-pair` counts skill × agent pairs; `logical-skill` counts a skill once all agents have it. */
  mode: PresetBarMode;
  /** Add the missing pairs. The bar stays locked until the promise settles. */
  onActivate: (preset: Preset, missing: SkillAgentPair[]) => Promise<unknown>;
  /** Remove the pairs that are present. */
  onDeactivate: (preset: Preset, present: SkillAgentPair[]) => Promise<unknown>;
  className?: string;
}

/**
 * Row of preset pills for a scope. ✓ = fully deployed, n/m = partly, plain = not deployed.
 * Click adds what is missing (or removes everything when fully deployed); shift+click always removes.
 * Presets with no skills are hidden, and only one action runs at a time.
 */
export function PresetBar({
  presets,
  skills,
  agentKeys,
  exists,
  mode,
  onActivate,
  onDeactivate,
  className,
}: PresetBarProps): ReactNode {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const knownSkillIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills]);

  const items = useMemo(
    () =>
      presets
        .map((preset) => ({
          preset,
          state: computePresetState(preset, knownSkillIds, agentKeys, exists, mode),
        }))
        .filter(({ state }) => state.activity !== "empty"),
    [presets, knownSkillIds, agentKeys, exists, mode],
  );

  if (items.length === 0) return null;

  const run = async (preset: Preset, action: () => Promise<unknown>): Promise<void> => {
    if (busyId) return;
    setBusyId(preset.id);
    try {
      await action();
    } catch {
      // The callback owns error reporting (mutations toast); the bar only needs to unlock.
    } finally {
      setBusyId(null);
    }
  };

  return (
    <fieldset
      aria-label={t("presetBar.label")}
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {items.map(({ preset, state }) => {
        const busy = busyId === preset.id;
        const active = state.activity === "active";
        const partial = state.activity === "partial";
        return (
          <Tooltip key={preset.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={active}
                disabled={busyId !== null}
                onClick={(event) => {
                  const remove = active || (event.shiftKey && state.present.length > 0);
                  void run(preset, () =>
                    remove
                      ? onDeactivate(preset, state.present)
                      : onActivate(preset, state.missing),
                  );
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                  active && "border-kit/40 bg-kit/15 text-kit",
                  partial && "border-kit/30 bg-kit/5 text-foreground",
                  !active &&
                    !partial &&
                    "border-border bg-card text-muted-foreground hover:border-kit/40 hover:text-foreground",
                )}
              >
                <PresetIcon icon={preset.icon} size="sm" className="rounded-full" />
                <span className="max-w-40 truncate">{preset.name}</span>
                {busy ? <Spinner className="size-3" /> : null}
                {!busy && active ? <Check className="size-3" /> : null}
                {!busy && partial ? (
                  <span className="font-mono text-[0.625rem] tabular-nums text-kit">
                    {state.installed}/{state.total}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">
                {t(`presetBar.${state.activity}`, {
                  installed: state.installed,
                  total: state.total,
                })}
              </p>
              <p className="opacity-80">
                {t(active ? "presetBar.clickToRemove" : "presetBar.clickToAdd")}
              </p>
              {partial ? <p className="opacity-80">{t("presetBar.shiftHint")}</p> : null}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </fieldset>
  );
}
