import type { Skill } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Layers, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useShell } from "@/components/layout/shell-context";
import { PageSection } from "@/components/PageSection";
import { PresetIcon } from "@/components/PresetIcon";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddSkillsToPreset, useRemoveSkillsFromPreset } from "@/hooks/mutations/preset-detail";
import { usePresets } from "@/hooks/queries/presets";

/** Every preset with a checkbox: tick to put this skill in it. Membership never touches disk. */
export function PresetsTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const presets = usePresets();
  const add = useAddSkillsToPreset();
  const remove = useRemoveSkillsFromPreset();

  if (presets.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (presets.isError) {
    return <ErrorState error={presets.error} onRetry={() => void presets.refetch()} />;
  }
  if (presets.data.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title={t("library.presets.emptyTitle")}
        description={t("library.presets.emptyDescription")}
        action={{ label: t("presets.new"), icon: Plus, onClick: () => shell.openPresetDialog() }}
      />
    );
  }

  const memberCount = presets.data.filter((preset) => preset.skillIds.includes(skill.id)).length;

  return (
    <PageSection
      title={t("library.presets.title")}
      description={t("library.presets.summary", {
        count: memberCount,
        total: presets.data.length,
      })}
    >
      <ul className="divide-y rounded-lg border bg-card">
        {presets.data.map((preset) => {
          const member = preset.skillIds.includes(skill.id);
          const inputId = `skill-preset-${preset.id}`;
          return (
            <li key={preset.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={inputId}
                checked={member}
                disabled={add.isPending || remove.isPending}
                onCheckedChange={(next) =>
                  (next === true ? add : remove).mutate({
                    preset,
                    skillIds: [skill.id],
                    silent: true,
                  })
                }
              />
              <PresetIcon icon={preset.icon} size="sm" />
              <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                <span className="block truncate text-sm font-medium">{preset.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("library.presets.skillCount", { count: preset.skillIds.length })}
                </span>
              </label>
              <Link
                to="/presets/$presetId"
                params={{ presetId: preset.id }}
                aria-label={t("library.presets.open", { name: preset.name })}
                title={t("library.presets.open", { name: preset.name })}
                className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
