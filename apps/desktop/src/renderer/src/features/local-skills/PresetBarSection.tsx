import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PresetBar, type PresetBarProps } from "@/components/PresetBar";
import { SECTION_LABEL } from "@/lib/styles";

export interface PresetBarSectionProps extends Omit<PresetBarProps, "className"> {
  /** Says what the pills act on, e.g. "Applies to the 4 agents below". */
  hint?: string;
}

/**
 * A labelled `PresetBar`. Draws nothing when the bar would be empty (no agents in scope, or no
 * preset with a skill that still exists and would go to one of them), so pages never show a heading over a blank row.
 */
export function PresetBarSection({ hint, ...bar }: PresetBarSectionProps): ReactNode {
  const { t } = useTranslation();
  const known = new Set(bar.skills.map((skill) => skill.id));
  const hasPills = bar.presets.some((preset) => {
    const wanted = bar.wanted?.(preset);
    return preset.skillIds.some(
      (skillId) =>
        known.has(skillId) && bar.agentKeys.some((agentKey) => wanted?.(skillId, agentKey) ?? true),
    );
  });
  if (!hasPills) return null;

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
      <h2 className={SECTION_LABEL}>{t("presetBar.label")}</h2>
      <PresetBar {...bar} className="flex-1" />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </section>
  );
}
