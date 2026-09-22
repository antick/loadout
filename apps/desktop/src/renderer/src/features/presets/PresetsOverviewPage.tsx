import type { Preset } from "@loadout/shared";
import { Layers, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useShell } from "@/components/layout/shell-context";
import { CARD_GRID_CLASS, CardGridSkeleton, LinkCard } from "@/components/LinkCard";
import { PresetIcon } from "@/components/PresetIcon";
import { Button } from "@/components/ui/button";
import { usePresets } from "@/hooks/queries/presets";

function PresetCard({ preset }: { preset: Preset }): ReactNode {
  const { t } = useTranslation();
  return (
    <LinkCard
      link={{ to: "/presets/$presetId", params: { presetId: preset.id } }}
      label={t("presetPage.overview.open", { name: preset.name })}
    >
      <div className="flex items-center gap-3">
        <PresetIcon icon={preset.icon} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{preset.name}</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("presetPage.skillCount", { count: preset.skillIds.length })}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {preset.description || t("presetPage.noDescription")}
      </p>
    </LinkCard>
  );
}

/** Every preset as a card, in the user's order. The Presets section lands here. */
export function PresetsOverviewPage(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const presets = usePresets();
  const create = (): void => shell.openPresetDialog();

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-5">
      <PageHeader
        title={t("presetPage.overview.title")}
        subtitle={
          presets.data?.length
            ? t("presetPage.overview.subtitle", { count: presets.data.length })
            : undefined
        }
        actions={
          <Button size="sm" onClick={create}>
            <Plus />
            {t("presets.new")}
          </Button>
        }
      />
      {presets.isPending ? (
        <CardGridSkeleton />
      ) : presets.error ? (
        <ErrorState
          error={presets.error}
          onRetry={() => void presets.refetch()}
          className="flex-1"
        />
      ) : presets.data.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("presetPage.overview.emptyTitle")}
          description={t("presetPage.overview.emptyDescription")}
          action={{ label: t("presets.new"), icon: Plus, onClick: create }}
          className="flex-1"
        />
      ) : (
        <div className={CARD_GRID_CLASS}>
          {presets.data.map((preset) => (
            <PresetCard key={preset.id} preset={preset} />
          ))}
        </div>
      )}
    </div>
  );
}
