import type { Preset, Skill } from "@skillboard/shared";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { Info, Layers, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddFromLibrarySheet } from "@/components/AddFromLibrarySheet";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { InlineNotice } from "@/components/InlineNotice";
import { PageHeader } from "@/components/layout/PageHeader";
import { useShell } from "@/components/layout/shell-context";
import { PageSection } from "@/components/PageSection";
import { PresetIcon } from "@/components/PresetIcon";
import { SortableList } from "@/components/SortableList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PresetSkillRow } from "@/features/presets/PresetSkillRow";
import {
  useAddSkillsToPreset,
  useApplyPreset,
  useRemoveSkillsFromPreset,
  useReorderPresetSkills,
} from "@/hooks/mutations/preset-detail";
import { useRemovePreset } from "@/hooks/mutations/presets";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { usePresets } from "@/hooks/queries/presets";
import { useSkills } from "@/hooks/queries/skills";
import { moveId } from "@/lib/utils";

/** Where the app goes when the preset in the URL does not exist (any more). */
const FALLBACK_ROUTE = "/library";
/** Presets hold skills, not agents, so the picker shows no target row. */
const PICKER_TARGET = { kind: "none" } as const;

function PresetSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function PresetContent({ preset, skills }: { preset: Preset; skills: Skill[] }): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const agents = useAvailableAgents();
  const apply = useApplyPreset();
  const removePreset = useRemovePreset();
  const addSkills = useAddSkillsToPreset();
  const removeSkills = useRemoveSkillsFromPreset();
  const reorder = useReorderPresetSkills();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Members in preset order; ids of skills that left the library are ignored.
  const members = useMemo(() => {
    const byId = new Map(skills.map((skill) => [skill.id, skill]));
    return preset.skillIds.flatMap((id) => byId.get(id) ?? []);
  }, [preset.skillIds, skills]);
  const memberIds = members.map((skill) => skill.id);
  const memberIdSet = useMemo(() => new Set(preset.skillIds), [preset.skillIds]);
  const isMember = useCallback((skill: Skill) => memberIdSet.has(skill.id), [memberIdSet]);

  const askDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: t("presets.deleteTitle", { name: preset.name }),
      description: t("presets.deleteDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    removePreset.mutate(preset, { onSuccess: () => void navigate({ to: FALLBACK_ROUTE }) });
  };

  return (
    <div className="flex min-h-full flex-col gap-5 px-6 py-5">
      <PageHeader
        title={preset.name}
        subtitle={t("presetPage.skillCount", { count: members.length })}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => shell.openPresetDialog(preset)}>
              <Pencil />
              <span className="max-xl:sr-only">{t("presetPage.edit")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-danger"
              disabled={removePreset.isPending}
              onClick={() => void askDelete()}
            >
              <Trash2 />
              <span className="max-xl:sr-only">{t("common.delete")}</span>
            </Button>
            <Button
              size="sm"
              disabled={members.length === 0 || apply.isPending}
              onClick={() => apply.mutate(preset)}
            >
              {apply.isPending ? <Spinner /> : <Play />}
              {t("presetPage.apply")}
            </Button>
          </>
        }
      />

      <header className="flex items-start gap-3">
        <PresetIcon icon={preset.icon} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">{preset.name}</h2>
          <p className="text-sm text-muted-foreground">
            {preset.description ?? t("presetPage.noDescription")}
          </p>
        </div>
      </header>

      <InlineNotice tone="violet" icon={Info}>
        {t("presetPage.applyNote")}
      </InlineNotice>

      <PageSection
        title={t("presetPage.skills")}
        description={members.length > 1 ? t("presetPage.reorderHint") : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Plus />
            {t("presetPage.addSkills")}
          </Button>
        }
        className="flex-1"
      >
        {members.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={t("presetPage.empty.title")}
            description={t("presetPage.empty.description")}
            action={{
              label: t("presetPage.addSkills"),
              icon: Plus,
              onClick: () => setPickerOpen(true),
            }}
            className="flex-1"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <SortableList
              items={members}
              onReorder={(skillIds) => reorder.mutate({ presetId: preset.id, skillIds })}
              renderItem={(skill, index) => (
                <PresetSkillRow
                  presetId={preset.id}
                  skill={skill}
                  agents={agents.data ?? []}
                  position={index + 1}
                  isFirst={index === 0}
                  isLast={index === members.length - 1}
                  onMove={(step) =>
                    reorder.mutate({
                      presetId: preset.id,
                      skillIds: moveId(memberIds, skill.id, step),
                    })
                  }
                  onRemove={() => removeSkills.mutate({ preset, skillIds: [skill.id] })}
                />
              )}
            />
          </div>
        )}
      </PageSection>

      <AddFromLibrarySheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        target={PICKER_TARGET}
        exclude={isMember}
        title={t("presetPage.picker.title", { name: preset.name })}
        description={t("presetPage.picker.description")}
        ctaLabel={(count) =>
          count === 0 ? t("presetPage.addSkills") : t("presetPage.picker.add", { count })
        }
        onSubmit={(skillIds) => addSkills.mutateAsync({ preset, skillIds })}
      />
    </div>
  );
}

/** One preset: its skills in order, per-agent switches, and the one-time "apply" action. */
export function PresetPage({ presetId }: { presetId: string }): ReactNode {
  const presets = usePresets();
  const skills = useSkills();

  if (presets.isError) {
    return <ErrorState error={presets.error} onRetry={() => void presets.refetch()} />;
  }
  if (skills.isError) {
    return <ErrorState error={skills.error} onRetry={() => void skills.refetch()} />;
  }
  if (presets.isPending) return <PresetSkeleton />;

  const preset = presets.data.find((entry) => entry.id === presetId);
  if (!preset && presets.isFetching) return <PresetSkeleton />;
  if (!preset) return <Navigate to={FALLBACK_ROUTE} replace />;
  if (skills.isPending) return <PresetSkeleton />;

  return <PresetContent key={preset.id} preset={preset} skills={skills.data} />;
}
