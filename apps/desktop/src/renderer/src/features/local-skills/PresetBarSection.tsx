import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PresetBar, type PresetBarProps } from "@/components/PresetBar";

export interface PresetBarSectionProps extends Omit<PresetBarProps, "className"> {
  /** Says what the pills act on, e.g. "Applies to the 4 agents below". */
  hint?: string;
}

/**
 * A labelled `PresetBar`. Draws nothing when the bar would be empty (no agents in scope, or no
 * preset with a skill that still exists), so pages never show a heading over a blank row.
 */
export function PresetBarSection({ hint, ...bar }: PresetBarSectionProps): ReactNode {
  const { t } = useTranslation();
  const known = new Set(bar.skills.map((skill) => skill.id));
  const hasPills =
    bar.agentKeys.length > 0 &&
    bar.presets.some((preset) => preset.skillIds.some((skillId) => known.has(skillId)));
  if (!hasPills) return null;

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("presetBar.label")}
      </h2>
      <PresetBar {...bar} className="flex-1" />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </section>
  );
}
